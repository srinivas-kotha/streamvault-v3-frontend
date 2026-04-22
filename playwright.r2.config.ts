/**
 * Playwright config for post-hotfix round-2 smoke verification.
 * Uses a global setup to login once and reuse the session for all 7 checks.
 * Does NOT modify playwright.prod.config.ts (production config stays clean).
 */
import { defineConfig, devices } from "@playwright/test";

// Each test creates its own context with storageState loaded from
// tests/prod/live-verification-r2.spec.ts-snapshots/session-state.json
// (written by global-setup-r2.ts before tests run). Do NOT set
// storageState here — tests manage it explicitly to avoid the
// "config-level path resolved before globalSetup writes the file" issue.

export default defineConfig({
  testDir: "./tests/prod",
  testMatch: "**/live-verification-r2.spec.ts",
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  globalSetup: "./tests/prod/global-setup-r2.ts",
  reporter: [
    ["html", { outputFolder: "playwright-report-r2" }],
    ["list"],
  ],
  use: {
    baseURL:
      process.env["STREAMVAULT_PROD_URL"] ??
      "https://streamvault.srinivaskotha.uk",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: "fire-tv-1080p",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
