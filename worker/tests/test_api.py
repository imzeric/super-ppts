from fastapi.testclient import TestClient

from app.main import create_app
from app.queue import Settings


def client() -> TestClient:
    settings = Settings(
        token="test-token",
        database_path=":memory:",
        web_internal_url="http://127.0.0.1:9",
        autorun=False,
    )
    return TestClient(create_app(settings, database=":memory:"))


def payload(version: int = 1, key: str = "idem-key-1", project: str = "project-1") -> dict:
    return {
        "contractVersion": version,
        "projectId": project,
        "idempotencyKey": key,
        "items": [{"slotId": "slot-1", "slotVersion": "v1"}],
    }


def test_openapi_lists_jobs() -> None:
    with client() as api:
        document = api.get("/openapi.json")
        assert document.status_code == 200
        assert "/v1/jobs" in document.json()["paths"]
        assert "/health" in document.json()["paths"]


def test_auth_contract_and_cross_project_cancel() -> None:
    with client() as api:
        headers = {"Authorization": "Bearer test-token", "X-Contract-Version": "1"}
        assert api.get("/health").status_code == 200
        assert api.post("/v1/jobs", json=payload()).status_code == 401
        mismatch = api.post("/v1/jobs", headers=headers, json=payload(version=2))
        assert mismatch.status_code == 412
        assert mismatch.json()["code"] == "SCHEMA_MISMATCH"
        leaked = api.post("/v1/jobs", headers=headers, json={**payload(), "apiKey": "super-secret-key"})
        assert leaked.status_code == 422
        created = api.post("/v1/jobs", headers=headers, json=payload())
        assert created.status_code == 201
        job_id = created.json()["jobId"]
        conflict = api.post("/v1/jobs", headers=headers, json=payload(key="idem-key-2"))
        assert conflict.status_code == 409
        assert conflict.json()["jobId"] == job_id
        wrong = api.post(f"/v1/jobs/{job_id}/cancel", headers=headers, json={"projectId": "other-project"})
        assert wrong.status_code == 404
        same = api.get(f"/v1/jobs/{job_id}", headers=headers, params={"projectId": "project-1"})
        assert same.json()["status"] == "queued"
        assert "super-secret-key" not in same.text
