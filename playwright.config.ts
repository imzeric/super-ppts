import { rmSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

rmSync("data/e2e.db", { force: true });

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3456",
  },
  webServer: {
    command: "bash scripts/e2e-server.sh",
    port: 3456,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_PATH: `${process.cwd()}/data/e2e.db`,
      WORKER_DATABASE_PATH: `${process.cwd()}/data/e2e-jobs.db`,
      INTERNAL_SERVICE_TOKEN: "e2e-internal-token",
      WORKER_URL: "http://127.0.0.1:8096",
      WEB_INTERNAL_URL: "http://127.0.0.1:3456",
      JOB_TEST_DELAY_MS: "700",
      AI_API_KEY: "",
      AI_BASE_URL: "",
      AI_MODEL: "",
      NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
    },
  },
});
