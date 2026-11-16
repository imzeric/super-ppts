import { rmSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

rmSync("data/e2e.db", { force: true });

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3456",
  },
  webServer: {
    command: "pnpm exec next start -p 3456",
    port: 3456,
    reuseExistingServer: false,
    env: {
      DATABASE_PATH: `${process.cwd()}/data/e2e.db`,
      AI_API_KEY: "",
      AI_BASE_URL: "",
      AI_MODEL: "",
      NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
    },
  },
});
