import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // WebKit engine — closest to Amazon Silk (Fire TV) browser.
      // iPad Pro 11 device profile provides a realistic viewport + UA baseline.
      name: "webkit",
      use: { ...devices["iPad Pro 11"] },
    },
    {
      // Expert clause (shipped): Desktop Safari WebKit — catches regressions on Mac
      // browsers alongside the tablet Silk profile. Both share the WebKit engine;
      // different viewports + UA strings surface distinct layout edge cases.
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
  },
});
