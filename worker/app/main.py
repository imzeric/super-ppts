from __future__ import annotations

import hmac
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import jsonschema
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from .queue import (
    CONTRACT_VERSION,
    JobError,
    Settings,
    State,
    abort_connection,
    cancel_job,
    connect,
    create_job,
    loop,
    read_job,
    recover_startup,
    retry_job,
)

def load_schema() -> dict:
    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / "contracts" / "v1" / "job.schema.json",
        here.parents[1] / "contracts" / "v1" / "job.schema.json",
    ]
    for path in candidates:
        if path.exists():
            return __import__("json").loads(path.read_text())
    raise FileNotFoundError("contracts/v1/job.schema.json")


VALIDATOR = jsonschema.Draft202012Validator(load_schema())


class ProjectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    projectId: str


def settings_from_env() -> Settings:
    token = os.environ.get("INTERNAL_SERVICE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("INTERNAL_SERVICE_TOKEN is required")
    delay = float(os.environ.get("JOB_TEST_DELAY_MS", "0") or "0") / 1000
    return Settings(
        token=token,
        database_path=os.environ.get("WORKER_DATABASE_PATH", "data/jobs.db"),
        web_internal_url=os.environ.get("WEB_INTERNAL_URL", "http://127.0.0.1:3000").rstrip("/"),
        lease_seconds=float(os.environ.get("JOB_LEASE_SECONDS", "10")),
        item_delay_seconds=delay,
    )


def create_app(settings: Settings | None = None, database: str | None = None) -> FastAPI:
    resolved = settings or settings_from_env()
    conn = connect(database or resolved.database_path)
    state = State(settings=resolved, conn=conn)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        recover_startup(state)
        thread: threading.Thread | None = None
        if resolved.autorun:
            thread = threading.Thread(target=loop, args=(state,), name="job-worker", daemon=True)
            thread.start()
        yield
        state.stop.set()
        for client in list(state.inflight.values()):
            abort_connection(client)
        if thread is not None:
            thread.join(timeout=2)

    app = FastAPI(title="super-ppts worker", version="1", lifespan=lifespan)
    app.state.jobs = state

    def authorized(request: Request) -> bool:
        header = request.headers.get("authorization", "")
        expected = f"Bearer {resolved.token}"
        if len(header) != len(expected):
            return False
        return hmac.compare_digest(header, expected)

    def contract_header(request: Request) -> JSONResponse | None:
        sent = request.headers.get("x-contract-version")
        if sent is not None and sent != str(CONTRACT_VERSION):
            return JSONResponse(
                status_code=412,
                content={"code": "SCHEMA_MISMATCH", "message": "服务契约版本不一致。请使用同一版本的编辑器和绘制服务。"},
            )
        return None

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "contractVersion": CONTRACT_VERSION}

    @app.post("/v1/jobs")
    async def post_job(request: Request) -> JSONResponse:
        if not authorized(request):
            return JSONResponse(status_code=401, content={"code": "UNAUTHORIZED", "message": "内部调用未通过校验。"})
        mismatch = contract_header(request)
        if mismatch is not None:
            return mismatch
        payload = await request.json()
        if isinstance(payload, dict) and payload.get("contractVersion") not in (None, CONTRACT_VERSION):
            return JSONResponse(
                status_code=412,
                content={"code": "SCHEMA_MISMATCH", "message": "服务契约版本不一致。请使用同一版本的编辑器和绘制服务。"},
            )
        errors = sorted(VALIDATOR.iter_errors(payload), key=lambda item: list(item.path))
        if errors or not isinstance(payload, dict):
            return JSONResponse(status_code=422, content={"code": "VALIDATION", "message": "任务内容不符合契约。"})
        try:
            job = create_job(state, payload)
        except JobError as error:
            body = {"code": error.code, "message": error.message}
            if error.job_id:
                body["jobId"] = error.job_id
            return JSONResponse(status_code=error.status, content=body)
        return JSONResponse(status_code=201, content=job)

    @app.get("/v1/jobs/{job_id}")
    def get_job(job_id: str, projectId: str, request: Request) -> JSONResponse:
        if not authorized(request):
            return JSONResponse(status_code=401, content={"code": "UNAUTHORIZED", "message": "内部调用未通过校验。"})
        try:
            return JSONResponse(read_job(state, job_id, projectId))
        except JobError as error:
            return JSONResponse(status_code=error.status, content={"code": error.code, "message": error.message})

    @app.post("/v1/jobs/{job_id}/cancel")
    def post_cancel(job_id: str, body: ProjectIn, request: Request) -> JSONResponse:
        if not authorized(request):
            return JSONResponse(status_code=401, content={"code": "UNAUTHORIZED", "message": "内部调用未通过校验。"})
        try:
            return JSONResponse(cancel_job(state, job_id, body.projectId))
        except JobError as error:
            return JSONResponse(status_code=error.status, content={"code": error.code, "message": error.message})

    @app.post("/v1/jobs/{job_id}/retry")
    def post_retry(job_id: str, body: ProjectIn, request: Request) -> JSONResponse:
        if not authorized(request):
            return JSONResponse(status_code=401, content={"code": "UNAUTHORIZED", "message": "内部调用未通过校验。"})
        try:
            return JSONResponse(retry_job(state, job_id, body.projectId))
        except JobError as error:
            body_json = {"code": error.code, "message": error.message}
            if error.job_id:
                body_json["jobId"] = error.job_id
            return JSONResponse(status_code=error.status, content=body_json)

    return app


app = None
if os.environ.get("INTERNAL_SERVICE_TOKEN"):
    app = create_app()
