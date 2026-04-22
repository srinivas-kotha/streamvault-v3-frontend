import { defineConfig, devices } from "@playwright/test";

/**
 * Production smoke + visual regression config.
 *
 * Separate from `playwright.config.ts` (which targets `npm run dev` on
 * localhost:5173) — this runs against the deployed public URL so we catch
 * bugs that only manifest in the prod bundle (e.g. baked env vars, nginx
 * proxy misconfig, CDN caching, CSP).
 *
 * Required env vars:
 *   STREAMVAULT_PROD_URL    — origin, defaults to https://streamvault.srinivaskotha.uk
 *   STREAMVAULT_E2E_USER    — test username (e.g. sv_e2e_test)
 *   STREAMVAULT_E2E_PASS    — test password
 *
 * Run locally: `npm run test:e2e:prod`
 * Update snapshots: `npm run test:e2e:prod -- --update-snapshots`
 */
export default defineConfig({
  testDir: "./tests/prod",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 1,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report-prod" }], ["list"]],
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
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-ipad",
      use: { ...devices["iPad Pro 11"] },
    },
  ],
  expect: {
    // Tolerance for visual diffs — CDN re-compression + font hinting differ.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.2 },
  },
});
