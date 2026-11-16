#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export INTERNAL_SERVICE_TOKEN="${INTERNAL_SERVICE_TOKEN:-e2e-internal-token}"
export WORKER_URL="${WORKER_URL:-http://127.0.0.1:8096}"
export WEB_INTERNAL_URL="${WEB_INTERNAL_URL:-http://127.0.0.1:3456}"
export WORKER_DATABASE_PATH="${WORKER_DATABASE_PATH:-$ROOT/data/e2e-jobs.db}"
export DATABASE_PATH="${DATABASE_PATH:-$ROOT/data/e2e.db}"
export JOB_TEST_DELAY_MS="${JOB_TEST_DELAY_MS:-700}"
mkdir -p "$ROOT/data"
rm -f "$WORKER_DATABASE_PATH"
PY="${PYTHON:-python3}"
if [[ -x /tmp/super-ppts-worker/bin/python ]]; then
  PY=/tmp/super-ppts-worker/bin/python
fi
"$PY" -m uvicorn app.main:app --app-dir "$ROOT/worker" --host 127.0.0.1 --port 8096 &
worker_pid=$!
cleanup() {
  kill "$worker_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT
for _ in $(seq 1 50); do
  if curl -sf http://127.0.0.1:8096/health >/dev/null; then
    break
  fi
  sleep 0.1
done
curl -sf http://127.0.0.1:8096/health >/dev/null
exec pnpm exec next start -p 3456
