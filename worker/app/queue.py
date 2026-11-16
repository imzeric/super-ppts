from __future__ import annotations

import http.client
import json
import socket
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urlparse


CONTRACT_VERSION = 1
ACTIVE = ("queued", "running", "cancelling")
CONNECT_BACKOFF = (0.2, 0.5, 1.0)


class JobError(Exception):
    def __init__(self, status: int, code: str, message: str, job_id: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.job_id = job_id


@dataclass
class Settings:
    token: str
    database_path: str
    web_internal_url: str
    lease_seconds: float = 10
    heartbeat_seconds: float = 3
    autorun: bool = True
    connect_backoff: tuple[float, ...] = CONNECT_BACKOFF
    item_delay_seconds: float = 0


@dataclass
class State:
    settings: Settings
    conn: Any
    lock: threading.Lock = field(default_factory=threading.Lock)
    owner: str = field(default_factory=lambda: str(uuid.uuid4()))
    inflight: dict[str, http.client.HTTPConnection] = field(default_factory=dict)
    stop: threading.Event = field(default_factory=threading.Event)
    clock: Callable[[], datetime] = field(default_factory=lambda: datetime.now)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect(path: str):
    import sqlite3
    from pathlib import Path

    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    migrate(conn)
    return conn


def migrate(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          signature TEXT NOT NULL,
          status TEXT NOT NULL,
          contract_version INTEGER NOT NULL,
          lease_owner TEXT,
          lease_until TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(project_id, idempotency_key)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS job_items (
          job_id TEXT NOT NULL,
          slot_id TEXT NOT NULL,
          slot_version TEXT NOT NULL,
          force INTEGER NOT NULL,
          status TEXT NOT NULL,
          attempt INTEGER NOT NULL DEFAULT 0,
          error_code TEXT,
          error_message TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (job_id, slot_id)
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_job
        ON jobs(project_id) WHERE status IN ('queued', 'running', 'cancelling')
        """
    )


def signature(items: list[dict[str, Any]]) -> str:
    rows = sorted((item["slotId"], item["slotVersion"], bool(item.get("force", False))) for item in items)
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"))


def create_job(state: State, body: dict[str, Any]) -> dict[str, Any]:
    if int(body.get("contractVersion", 0)) != CONTRACT_VERSION:
        raise JobError(412, "SCHEMA_MISMATCH", "服务契约版本不一致。请使用同一版本的编辑器和绘制服务。")
    items = body.get("items") or []
    if not isinstance(items, list) or not items or len(items) > 320:
        raise JobError(422, "VALIDATION", "一次任务需要 1 到 320 个占位。")
    project_id = str(body.get("projectId") or "")
    key = str(body.get("idempotencyKey") or "")
    if not project_id or not key:
        raise JobError(422, "VALIDATION", "任务缺少项目或幂等键。")
    signed = signature(items)
    now = utcnow()
    with state.lock:
        state.conn.execute("BEGIN IMMEDIATE")
        try:
            existing = state.conn.execute(
                "SELECT * FROM jobs WHERE project_id = ? AND idempotency_key = ?",
                (project_id, key),
            ).fetchone()
            if existing is not None:
                if existing["signature"] != signed:
                    raise JobError(409, "IDEMPOTENCY_CONFLICT", "同一个幂等键对应了不同的占位，没有新建任务。")
                job_id = existing["id"]
                state.conn.execute("COMMIT")
                return read_job(state, job_id, project_id)
            active = state.conn.execute(
                "SELECT id FROM jobs WHERE project_id = ? AND status IN ('queued','running','cancelling')",
                (project_id,),
            ).fetchone()
            if active is not None:
                raise JobError(409, "JOB_ACTIVE", "这个项目已有绘制任务。已接上该任务。", active["id"])
            job_id = str(uuid.uuid4())
            state.conn.execute(
                """
                INSERT INTO jobs (
                  id, project_id, idempotency_key, signature, status, contract_version,
                  lease_owner, lease_until, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'queued', ?, NULL, NULL, ?, ?)
                """,
                (job_id, project_id, key, signed, CONTRACT_VERSION, now, now),
            )
            for item in items:
                state.conn.execute(
                    """
                    INSERT INTO job_items (
                      job_id, slot_id, slot_version, force, status, attempt, updated_at
                    ) VALUES (?, ?, ?, ?, 'pending', 0, ?)
                    """,
                    (job_id, item["slotId"], item["slotVersion"], 1 if item.get("force") else 0, now),
                )
            state.conn.execute("COMMIT")
        except JobError:
            state.conn.execute("ROLLBACK")
            raise
        except Exception:
            state.conn.execute("ROLLBACK")
            raise
    return read_job(state, job_id, project_id)


def read_job(state: State, job_id: str, project_id: str) -> dict[str, Any]:
    job = state.conn.execute("SELECT * FROM jobs WHERE id = ? AND project_id = ?", (job_id, project_id)).fetchone()
    if job is None:
        raise JobError(404, "NOT_FOUND", "没有找到这个项目的绘制任务。")
    items = state.conn.execute(
        "SELECT * FROM job_items WHERE job_id = ? ORDER BY slot_id",
        (job_id,),
    ).fetchall()
    return {
        "contractVersion": CONTRACT_VERSION,
        "jobId": job["id"],
        "projectId": job["project_id"],
        "status": job["status"],
        "items": [
            {
                "slotId": item["slot_id"],
                "slotVersion": item["slot_version"],
                "status": item["status"],
                "errorCode": item["error_code"],
                "errorMessage": item["error_message"],
            }
            for item in items
        ],
    }


def cancel_job(state: State, job_id: str, project_id: str) -> dict[str, Any]:
    now = utcnow()
    with state.lock:
        job = state.conn.execute("SELECT * FROM jobs WHERE id = ? AND project_id = ?", (job_id, project_id)).fetchone()
        if job is None:
            raise JobError(404, "NOT_FOUND", "没有找到这个项目的绘制任务。")
        if job["status"] in ACTIVE:
            state.conn.execute(
                "UPDATE jobs SET status = 'cancelling', updated_at = ? WHERE id = ?",
                (now, job_id),
            )
            state.conn.execute(
                """
                UPDATE job_items SET status = 'cancelled', error_code = 'CANCELLED',
                  error_message = '已取消，尚未开始的占位不会绘制。', updated_at = ?
                WHERE job_id = ? AND status = 'pending'
                """,
                (now, job_id),
            )
        client = state.inflight.get(job_id)
    if client is not None:
        abort_connection(client)
    with state.lock:
        recompute(state, job_id, now)
    return read_job(state, job_id, project_id)


def retry_job(state: State, job_id: str, project_id: str) -> dict[str, Any]:
    now = utcnow()
    with state.lock:
        state.conn.execute("BEGIN IMMEDIATE")
        try:
            job = state.conn.execute(
                "SELECT * FROM jobs WHERE id = ? AND project_id = ?",
                (job_id, project_id),
            ).fetchone()
            if job is None:
                raise JobError(404, "NOT_FOUND", "没有找到这个项目的绘制任务。")
            if job["status"] in ACTIVE:
                raise JobError(409, "JOB_ACTIVE", "任务还在进行，不能重试。", job_id)
            active = state.conn.execute(
                "SELECT id FROM jobs WHERE project_id = ? AND status IN ('queued','running','cancelling') AND id != ?",
                (project_id, job_id),
            ).fetchone()
            if active is not None:
                raise JobError(409, "JOB_ACTIVE", "这个项目已有绘制任务。已接上该任务。", active["id"])
            cur = state.conn.execute(
                """
                UPDATE job_items SET status = 'pending', error_code = NULL, error_message = NULL, updated_at = ?
                WHERE job_id = ? AND status IN ('failed', 'interrupted')
                """,
                (now, job_id),
            )
            if cur.rowcount == 0:
                raise JobError(422, "VALIDATION", "没有失败或中断的占位可以重试。")
            state.conn.execute(
                "UPDATE jobs SET status = 'queued', lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ?",
                (now, job_id),
            )
            state.conn.execute("COMMIT")
        except JobError:
            state.conn.execute("ROLLBACK")
            raise
    return read_job(state, job_id, project_id)


def recover_startup(state: State) -> None:
    now = utcnow()
    with state.lock:
        rows = state.conn.execute(
            "SELECT id FROM jobs WHERE status IN ('running','cancelling')"
        ).fetchall()
        for row in rows:
            interrupt_leased(state, row["id"], now)
            pending = state.conn.execute(
                "SELECT COUNT(*) AS c FROM job_items WHERE job_id = ? AND status = 'pending'",
                (row["id"],),
            ).fetchone()["c"]
            if pending:
                state.conn.execute(
                    "UPDATE jobs SET status = 'queued', lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
            else:
                recompute(state, row["id"], now)


def recover_expired(state: State) -> None:
    now_dt = state.clock()
    now = now_dt.astimezone(timezone.utc).isoformat() if now_dt.tzinfo else datetime.now(timezone.utc).isoformat()
    rows = state.conn.execute(
        """
        SELECT id FROM jobs
        WHERE status IN ('running','cancelling')
          AND lease_owner IS NOT NULL
          AND lease_owner != ?
          AND (lease_until IS NULL OR lease_until < ?)
        """,
        (state.owner, now),
    ).fetchall()
    own = state.conn.execute(
        """
        SELECT id FROM jobs
        WHERE status IN ('running','cancelling')
          AND lease_owner = ?
          AND lease_until IS NOT NULL
          AND lease_until < ?
        """,
        (state.owner, now),
    ).fetchall()
    for row in [*rows, *own]:
        interrupt_leased(state, row["id"], now)
        pending = state.conn.execute(
            "SELECT COUNT(*) AS c FROM job_items WHERE job_id = ? AND status = 'pending'",
            (row["id"],),
        ).fetchone()["c"]
        if pending:
            state.conn.execute(
                "UPDATE jobs SET status = 'queued', lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ?",
                (now, row["id"]),
            )
        else:
            recompute(state, row["id"], now)


def interrupt_leased(state: State, job_id: str, now: str) -> None:
    state.conn.execute(
        """
        UPDATE job_items
        SET status = 'interrupted', error_code = 'INTERRUPTED',
            error_message = '进程重启或租约过期，进行中的调用已中断，不会自动重试。',
            updated_at = ?
        WHERE job_id = ? AND status = 'leased'
        """,
        (now, job_id),
    )


def claim(state: State) -> str | None:
    now = utcnow()
    until = (datetime.now(timezone.utc) + timedelta(seconds=state.settings.lease_seconds)).isoformat()
    row = state.conn.execute(
        "SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    cur = state.conn.execute(
        """
        UPDATE jobs SET status = 'running', lease_owner = ?, lease_until = ?, updated_at = ?
        WHERE id = ? AND status = 'queued'
        """,
        (state.owner, until, now, row["id"]),
    )
    if cur.rowcount != 1:
        return None
    return row["id"]


def recompute(state: State, job_id: str, now: str) -> None:
    items = state.conn.execute("SELECT status FROM job_items WHERE job_id = ?", (job_id,)).fetchall()
    statuses = [item["status"] for item in items]
    if any(status in ("pending", "leased") for status in statuses):
        return
    job = state.conn.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if any(status == "interrupted" for status in statuses):
        final = "interrupted"
    elif job["status"] == "cancelling" or any(status == "cancelled" for status in statuses):
        final = "cancelled"
    else:
        final = "completed"
    state.conn.execute(
        "UPDATE jobs SET status = ?, lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ?",
        (final, now, job_id),
    )


def run_once(state: State) -> bool:
    with state.lock:
        recover_expired(state)
        job_id = claim(state)
    if job_id is None:
        return False
    process_job(state, job_id)
    return True


def process_job(state: State, job_id: str) -> None:
    while not state.stop.is_set():
        with state.lock:
            job = state.conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if job is None or job["lease_owner"] != state.owner or job["status"] not in ACTIVE:
                return
            if job["status"] == "cancelling":
                now = utcnow()
                state.conn.execute(
                    """
                    UPDATE job_items SET status = 'cancelled', error_code = 'CANCELLED',
                      error_message = '已取消，尚未开始的占位不会绘制。', updated_at = ?
                    WHERE job_id = ? AND status = 'pending'
                    """,
                    (now, job_id),
                )
                recompute(state, job_id, now)
                return
            item = state.conn.execute(
                "SELECT * FROM job_items WHERE job_id = ? AND status = 'pending' ORDER BY slot_id LIMIT 1",
                (job_id,),
            ).fetchone()
            if item is None:
                recompute(state, job_id, utcnow())
                return
            now = utcnow()
            until = (datetime.now(timezone.utc) + timedelta(seconds=state.settings.lease_seconds)).isoformat()
            state.conn.execute(
                """
                UPDATE job_items SET status = 'leased', attempt = attempt + 1, updated_at = ?
                WHERE job_id = ? AND slot_id = ? AND status = 'pending'
                """,
                (now, job_id, item["slot_id"]),
            )
            state.conn.execute(
                "UPDATE jobs SET lease_until = ?, updated_at = ? WHERE id = ? AND lease_owner = ?",
                (until, now, job_id, state.owner),
            )
            attempt = state.conn.execute(
                "SELECT attempt FROM job_items WHERE job_id = ? AND slot_id = ?",
                (job_id, item["slot_id"]),
            ).fetchone()["attempt"]
            payload = {
                "project_id": job["project_id"],
                "slot_id": item["slot_id"],
                "slot_version": item["slot_version"],
                "force": bool(item["force"]),
            }
        result = call_web(state, job_id, payload)
        if result.get("retry"):
            if attempt < 3:
                time.sleep(state.settings.connect_backoff[min(attempt - 1, len(state.settings.connect_backoff) - 1)])
                with state.lock:
                    state.conn.execute(
                        "UPDATE job_items SET status = 'pending', updated_at = ? WHERE job_id = ? AND slot_id = ? AND status = 'leased'",
                        (utcnow(), job_id, payload["slot_id"]),
                    )
                continue
            result = {
                "status": "failed",
                "errorCode": "WEB_UNAVAILABLE",
                "errorMessage": "绘制服务暂时联系不上编辑器。占位没有改动。",
            }
        with state.lock:
            write_result(state, job_id, payload["slot_id"], result)
            if state.conn.execute(
                "SELECT COUNT(*) AS c FROM job_items WHERE job_id = ? AND status = 'pending'",
                (job_id,),
            ).fetchone()["c"] == 0:
                recompute(state, job_id, utcnow())
                return


def write_result(state: State, job_id: str, slot_id: str, result: dict[str, Any]) -> None:
    status = result.get("status") or "failed"
    if status not in ("succeeded", "skipped", "failed", "cancelled", "interrupted"):
        status = "failed"
    now = utcnow()
    allowed = ("leased", "interrupted") if status in ("succeeded", "skipped") else ("leased",)
    state.conn.execute(
        """
        UPDATE job_items
        SET status = ?, error_code = ?, error_message = ?, updated_at = ?
        WHERE job_id = ? AND slot_id = ? AND status IN ({})
        """.format(",".join("?" for _ in allowed)),
        (status, result.get("errorCode"), (result.get("errorMessage") or "")[:300] or None, now, job_id, slot_id, *allowed),
    )


def abort_connection(conn: http.client.HTTPConnection) -> None:
    sock = getattr(conn, "sock", None)
    if sock is not None:
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
    try:
        conn.close()
    except OSError:
        pass


def call_web(state: State, job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    if state.settings.item_delay_seconds:
        time.sleep(state.settings.item_delay_seconds)
    parsed_url = urlparse(state.settings.web_internal_url)
    conn = http.client.HTTPConnection(parsed_url.hostname or "127.0.0.1", parsed_url.port or 80, timeout=45)
    stop_beat = threading.Event()
    beater = threading.Thread(target=heartbeat, args=(state, job_id, stop_beat), daemon=True)
    body = json.dumps(
        {
            "contractVersion": CONTRACT_VERSION,
            "projectId": payload["project_id"],
            "jobId": job_id,
            "slotId": payload["slot_id"],
            "expectedVersion": payload["slot_version"],
            "force": payload["force"],
        }
    ).encode()
    with state.lock:
        state.inflight[job_id] = conn
    beater.start()
    try:
        try:
            conn.request(
                "POST",
                "/api/internal/generate-item",
                body=body,
                headers={
                    "Authorization": f"Bearer {state.settings.token}",
                    "X-Contract-Version": str(CONTRACT_VERSION),
                    "Content-Type": "application/json",
                    "Content-Length": str(len(body)),
                },
            )
        except ConnectionRefusedError:
            return {"retry": True}
        except OSError as error:
            if getattr(error, "errno", None) in {111, 61}:
                return {"retry": True}
            return terminal_after_disconnect(state, job_id)
        try:
            response = conn.getresponse()
            raw = response.read()
        except Exception:
            return terminal_after_disconnect(state, job_id)
        try:
            parsed = json.loads(raw.decode() or "{}")
        except Exception:
            parsed = {}
        data = parsed if isinstance(parsed, dict) else {}
        if response.status == 409:
            return {
                "status": "failed",
                "errorCode": str(data.get("code") or "STALE_SLOT"),
                "errorMessage": str(data.get("message") or "占位已变化，结果没有写入。"),
            }
        if response.status >= 400:
            return {
                "status": "failed",
                "errorCode": str(data.get("code") or "EXECUTION_FAILED"),
                "errorMessage": str(data.get("message") or "绘制失败。")[:300],
            }
        if data.get("contractVersion") != CONTRACT_VERSION:
            return {"status": "failed", "errorCode": "SCHEMA_MISMATCH", "errorMessage": "编辑器返回的契约版本不一致，结果没有写入。"}
        return {
            "status": data.get("status") or "failed",
            "errorCode": data.get("errorCode"),
            "errorMessage": data.get("errorMessage"),
        }
    finally:
        stop_beat.set()
        beater.join(timeout=1)
        with state.lock:
            state.inflight.pop(job_id, None)
        abort_connection(conn)


def terminal_after_disconnect(state: State, job_id: str) -> dict[str, Any]:
    with state.lock:
        job = state.conn.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is not None and job["status"] == "cancelling":
        return {"status": "cancelled", "errorCode": "CANCELLED", "errorMessage": "已取消当前绘制。已完成的占位会保留。"}
    return {
        "status": "interrupted",
        "errorCode": "INTERRUPTED",
        "errorMessage": "调用在返回前中断，不会自动重试。",
    }


def heartbeat(state: State, job_id: str, stop: threading.Event) -> None:
    while not stop.wait(state.settings.heartbeat_seconds):
        until = (datetime.now(timezone.utc) + timedelta(seconds=state.settings.lease_seconds)).isoformat()
        with state.lock:
            state.conn.execute(
                "UPDATE jobs SET lease_until = ?, updated_at = ? WHERE id = ? AND lease_owner = ?",
                (until, utcnow(), job_id, state.owner),
            )


def loop(state: State) -> None:
    while not state.stop.is_set():
        worked = False
        try:
            worked = run_once(state)
        except Exception:
            worked = False
        if not worked:
            state.stop.wait(0.05)
