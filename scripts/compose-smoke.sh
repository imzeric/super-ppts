#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export INTERNAL_SERVICE_TOKEN="${INTERNAL_SERVICE_TOKEN:-ci-demo-token}"
export HOST_PORT="${HOST_PORT:-3010}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-super-ppts-ci}"
unset AI_API_KEY AI_BASE_URL AI_MODEL AI_TEXT_API_KEY AI_TEXT_BASE_URL AI_TEXT_MODEL AI_VISION_API_KEY AI_IMAGE_API_KEY || true

status=0
cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    echo "---- compose ps ----"
    docker compose ps -a || true
    echo "---- compose logs ----"
    docker compose logs --no-color --tail 200 || true
  fi
  docker compose down -v --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT

docker compose build
docker compose up -d

HOST_PORT="$HOST_PORT" python3 - <<'PY'
import json
import os
import time
import urllib.request

port = os.environ["HOST_PORT"]
base = f"http://127.0.0.1:{port}"
deadline = time.time() + 180
last = "网页还没有就绪。"
while time.time() < deadline:
    try:
        with urllib.request.urlopen(base + "/", timeout=5) as home:
            page = home.read()
            home_ok = home.status == 200 and b"把说明写成大纲" in page
        with urllib.request.urlopen(base + "/api/health", timeout=5) as health:
            body = json.load(health)
        last = json.dumps(body, ensure_ascii=False)
        if home_ok and body.get("ok") is True and body.get("worker") == "up":
            print(last)
            raise SystemExit(0)
    except Exception as error:
        last = str(error)
    time.sleep(5)
print(last)
raise SystemExit("网页可打开且绘制服务为 up 的条件没有在 180 秒内满足。")
PY
