import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.queue import Settings, State, cancel_job, connect, create_job, process_job, read_job, recover_startup, retry_job, run_once


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode())
        self.server.calls.append(body["slotId"])
        if body["slotId"] == "block":
            self.server.hit.set()
            self.server.release.wait(3)
        if body.get("expectedVersion") == "old":
            payload = {"code": "STALE_SLOT", "message": "占位已在绘制期间被修改，结果没有写入。"}
            status = 409
        elif body["slotId"] == "bad" and body["slotId"] not in self.server.failed_once:
            self.server.failed_once.add(body["slotId"])
            payload = {"code": "PROVIDER_SCHEMA", "message": "模型没有返回图。"}
            status = 422
        elif body["slotId"] in self.server.done and not body.get("force"):
            payload = {"contractVersion": 1, "status": "skipped"}
            status = 200
        else:
            self.server.done.add(body["slotId"])
            payload = {"contractVersion": 1, "status": "succeeded"}
            status = 200
        raw = json.dumps(payload).encode()
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        except Exception:
            return

    def log_message(self, format: str, *args) -> None:
        return


def web_server() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.calls = []
    server.done = set()
    server.failed_once = set()
    server.hit = threading.Event()
    server.release = threading.Event()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def state_for(server: ThreadingHTTPServer, path: str = ":memory:") -> State:
    port = server.server_address[1]
    settings = Settings(
        token="test-token",
        database_path=path,
        web_internal_url=f"http://127.0.0.1:{port}",
        lease_seconds=10,
        heartbeat_seconds=30,
        autorun=False,
        connect_backoff=(0, 0, 0),
    )
    return State(settings=settings, conn=connect(path))


def create(state: State, project: str, key: str, slots: list[str], versions: dict[str, str] | None = None) -> dict:
    versions = versions or {}
    return create_job(
        state,
        {
            "contractVersion": 1,
            "projectId": project,
            "idempotencyKey": key,
            "items": [{"slotId": slot, "slotVersion": versions.get(slot, "v1")} for slot in slots],
        },
    )


def test_idempotent_create_and_project_lock() -> None:
    server = web_server()
    state = state_for(server)
    first = create(state, "p1", "idem-key-1", ["a"])
    again = create(state, "p1", "idem-key-1", ["a"])
    assert again["jobId"] == first["jobId"]
    try:
        create(state, "p1", "idem-key-2", ["a"])
        raise AssertionError("expected lock")
    except Exception as error:
        assert error.code == "JOB_ACTIVE"
        assert error.job_id == first["jobId"]
    try:
        create(state, "p1", "idem-key-1", ["b"])
        raise AssertionError("expected conflict")
    except Exception as error:
        assert error.code == "IDEMPOTENCY_CONFLICT"
    server.shutdown()


def test_partial_success_retry_does_not_repeat_success() -> None:
    server = web_server()
    state = state_for(server)
    job = create(state, "p1", "idem-key-1", ["a", "bad"])
    assert run_once(state) is True
    seen = {item["slotId"]: item["status"] for item in job_items(state, job)}
    assert seen == {"a": "succeeded", "bad": "failed"}
    assert server.calls.count("a") == 1
    retry_job(state, job["jobId"], "p1")
    assert run_once(state) is True
    seen = {item["slotId"]: item["status"] for item in job_items(state, job)}
    assert seen["a"] == "succeeded"
    assert seen["bad"] == "succeeded"
    assert server.calls.count("a") == 1
    assert server.calls.count("bad") == 2
    server.shutdown()


def test_restart_keeps_success_and_interrupts_inflight() -> None:
    server = web_server()
    state = state_for(server)
    job = create(state, "p1", "idem-key-1", ["a", "b", "c"])
    state.conn.execute("UPDATE jobs SET status = 'running', lease_owner = 'dead' WHERE id = ?", (job["jobId"],))
    state.conn.execute("UPDATE job_items SET status = 'succeeded' WHERE job_id = ? AND slot_id = 'a'", (job["jobId"],))
    state.conn.execute("UPDATE job_items SET status = 'leased' WHERE job_id = ? AND slot_id = 'b'", (job["jobId"],))
    recover_startup(state)
    current = {item["slotId"]: item["status"] for item in job_items(state, job)}
    assert current["a"] == "succeeded"
    assert current["b"] == "interrupted"
    assert current["c"] == "pending"
    assert run_once(state) is True
    current = {item["slotId"]: item["status"] for item in job_items(state, job)}
    assert current == {"a": "succeeded", "b": "interrupted", "c": "succeeded"}
    assert server.calls == ["c"]
    assert state.conn.execute("SELECT COUNT(*) AS c FROM jobs WHERE status = 'running'").fetchone()["c"] == 0
    server.shutdown()


def test_cancel_aborts_blocked_call_and_keeps_completed() -> None:
    server = web_server()
    state = state_for(server)
    job = create(state, "p1", "idem-key-1", ["a", "block"])
    worker = threading.Thread(target=process_job, args=(state, job["jobId"]), daemon=True)
    state.conn.execute(
        "UPDATE jobs SET status = 'running', lease_owner = ? WHERE id = ?",
        (state.owner, job["jobId"]),
    )
    worker.start()
    assert server.hit.wait(2)
    cancel_job(state, job["jobId"], "p1")
    worker.join(2)
    assert not worker.is_alive()
    cancelled = read_job(state, job["jobId"], "p1")
    statuses = {item["slotId"]: item["status"] for item in cancelled["items"]}
    assert statuses["a"] == "succeeded"
    assert statuses["block"] == "cancelled"
    wrong = None
    try:
        cancel_job(state, job["jobId"], "other-project")
    except Exception as error:
        wrong = error
    assert wrong is not None and wrong.status == 404
    server.release.set()
    server.shutdown()


def test_stale_result_is_not_success() -> None:
    server = web_server()
    state = state_for(server)
    job = create(state, "p1", "idem-key-1", ["a"], {"a": "old"})
    run_once(state)
    item = job_items(state, job)[0]
    assert item["status"] == "failed"
    assert item["errorCode"] == "STALE_SLOT"
    server.shutdown()


def test_connection_failure_is_bounded_and_not_retried_forever() -> None:
    settings = Settings(
        token="test-token",
        database_path=":memory:",
        web_internal_url="http://127.0.0.1:1",
        connect_backoff=(0, 0, 0),
        autorun=False,
    )
    state = State(settings=settings, conn=connect(":memory:"))
    job = create(state, "p1", "idem-key-1", ["a"])
    run_once(state)
    item = job_items(state, job)[0]
    attempt = state.conn.execute("SELECT attempt FROM job_items WHERE job_id = ?", (job["jobId"],)).fetchone()["attempt"]
    assert item["status"] == "failed"
    assert item["errorCode"] == "WEB_UNAVAILABLE"
    assert attempt == 3


def test_database_does_not_store_provider_secrets() -> None:
    server = web_server()
    state = state_for(server)
    create(state, "p1", "idem-key-1", ["a"])
    raw = "\n".join(
        " ".join("" if value is None else str(value) for value in row)
        for row in state.conn.execute("SELECT * FROM jobs").fetchall()
    )
    raw += "\n".join(
        " ".join("" if value is None else str(value) for value in row)
        for row in state.conn.execute("SELECT * FROM job_items").fetchall()
    )
    assert "super-secret-key" not in raw
    assert "apiKey" not in raw
    server.shutdown()


def job_items(state: State, job: dict):
    fresh = create_job(
        state,
        {
            "contractVersion": 1,
            "projectId": job["projectId"],
            "idempotencyKey": "idem-key-1" if job["projectId"] == "p1" else "other",
            "items": [{"slotId": item["slotId"], "slotVersion": item["slotVersion"]} for item in job["items"]],
        },
    )
    return fresh["items"]
