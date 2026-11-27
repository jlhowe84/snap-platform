import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// End-to-end tests run the real app against a local Supabase loaded by
// scripts/e2e-db.sh. They never reach the hosted project, Gmail, Twilio,
// Captura or the Claude API: the local database has no secrets for them.
const envFile = "e2e/.env.e2e";
const e2eEnv: Record<string, string> = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m) e2eEnv[m[1]] = m[2];
  }
}
for (const [k, v] of Object.entries(e2eEnv)) process.env[k] ??= v;

const PORT = 3100;
const dev = process.env.E2E_DEV === "1";

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: dev ? `npx next dev -p ${PORT}` : `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    // The app sends mail to the fake Gmail in e2e/fake-gmail.ts (loopback only).
    env: { ...e2eEnv, E2E_GMAIL_API: "http://127.0.0.1:3199/gmail" },
  },
});
