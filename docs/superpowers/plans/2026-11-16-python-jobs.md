# Python Durable Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private FastAPI worker that owns durable batch-draw jobs, while Next.js keeps the editor, project SQLite, provider secrets, and native PPTX export.

**Architecture:** Browser talks only to Next.js. Next.js enqueues a versioned job to Python and polls it. Python leases items and calls `POST /api/internal/generate-item`. Next.js runs the existing slot generator and commits only if `updated_at` still matches. Each service owns one SQLite file.

**Tech Stack:** Next.js 16.4.6, React 19.3.1, Node 22.23.4, Python 3.12, FastAPI 0.115.6, uvicorn 0.34.0, httpx 0.28.1, pydantic 2.10.6, pytest 8.3.4.

## Global Constraints

- Contract version is exactly `1`.
- Do not open the worker port in Compose. Publish only `127.0.0.1:3000`.
- Do not put API keys in job payloads, Python SQLite, logs, or browser JSON.
- Do not auto-retry a provider call after an uncertain crash. Mark it `interrupted`.
- Do not add NestJS, Redis, Postgres, document extraction, or a second diagram compiler.
- Keep the six-step Chinese UI, demo mode without model keys, and native OOXML guarantees.
- Migrations are additive. No destructive delete.

---

### Task 1: Worker state machine

**Files:** `worker/app/queue.py`, `worker/tests/test_queue.py`, `contracts/v1/job.schema.json`

- [x] Write failing tests for create, idempotency, project lock, lease recovery, skip of succeeded items, cancel, stale result, and partial retry.
- [x] Implement SQLite transactions, leases, and the worker loop against a fake web handler.
- [x] Run `python -m pytest worker/tests/test_queue.py -q`.

### Task 2: Worker HTTP API

**Files:** `worker/app/main.py`, `worker/tests/test_api.py`

- [x] Test 401, 412, 409, 404 cross-project cancel, and OpenAPI.
- [x] Implement FastAPI routes and bearer auth.
- [x] Run `python -m pytest worker/tests -q`.

### Task 3: Next.js safety and internal execution

**Files:** `src/ai/guard.ts`, `src/db/database.ts`, `src/server/service.ts`, `src/server/redact.ts`, `tests/reliability.test.ts`

- [x] Test SSRF policy, transaction rollback, reseed rejection, redaction, and stale writes.
- [x] Implement those behaviors without changing demo generation results.
- [x] Run `pnpm exec vitest run tests/reliability.test.ts tests/media.test.ts tests/provider.test.ts tests/workflow.test.ts`.

### Task 4: Batch UI and Docker

**Files:** illustrate page, generate routes, `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `README.md`

- [x] Poll job status in the existing illustrate step.
- [x] Document local and Compose startup, backup, and rollback.
- [x] Run unit tests, typecheck, build, and e2e. Docker CLI is not installed here, so Compose was not started.

### Task 5: Pull request

- [x] Commit on `song/python-durable-jobs-7f08` and open a new PR into `main`. Do not merge.
