import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Fire TV performance suite against production.
 *
 * Separate from `playwright.prod.config.ts` (prod smoke) because perf runs need:
 *   - workers=1 (parallelism skews CPU throttling)
 *   - retries=0 (a retried run is unrepresentative)
 *   - NO video / trace (they steal CPU and skew numbers)
 *   - Long timeouts (throttled + network)
 *   - Chromium only (CDP perf domains; WebKit lacks CPUThrottlingRate)
 *
 * Run: `npm run perf:prod` — orchestrates health-check + playwright + lighthouse + report.
 * Raw: `npm run perf:playwright` — just the Playwright side.
 *
 * Env:
 *   STREAMVAULT_PROD_URL  — defaults to https://streamvault.srinivaskotha.uk
 *   STREAMVAULT_E2E_USER  — login (prod credentials; reuses tests/prod/helpers.ts loginViaUI)
 *   STREAMVAULT_E2E_PASS  — ditto
 *   PERF_CPU_RATE         — CPU throttle multiplier (default 6; use 4 for Stick 4K Max)
 *   PERF_BASELINE         — "1" to disable throttling (sanity baseline run)
 */
export default defineConfig({
  testDir: "./tests/perf",
  outputDir: "./perf-artifacts/playwright-output",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  timeout: 180_000,
  globalSetup: resolve(__dirname, "tests/perf/global-setup.ts"),
  reporter: [
    ["list"],
    ["json", { outputFile: "perf-artifacts/playwright-metrics.json" }],
  ],
  use: {
    baseURL:
      process.env["STREAMVAULT_PROD_URL"] ??
      "https://streamvault.srinivaskotha.uk",
    storageState: "perf-artifacts/auth.json",
    trace: "off",
    screenshot: "off",
    video: "off",
    ignoreHTTPSErrors: false,
    launchOptions: {
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--enable-precise-memory-info",
      ],
    },
  },
  projects: [
    {
      name: "fire-tv-stick-4k",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      },
      metadata: {
        cpuRate: 4,
        label: "Fire TV Stick 4K / 4K Max",
      },
    },
    {
      name: "fire-tv-stick-lite",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      },
      metadata: {
        cpuRate: 6,
        label: "Fire TV Stick Lite / older Silk",
      },
    },
  ],
});
