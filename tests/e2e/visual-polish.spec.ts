/**
 * Visual polish baselines — feat/futuristic-polish pass.
 *
 * Navigates each main route and takes a screenshot so future regressions
 * are caught via toHaveScreenshot pixel diffing.
 *
 * Auth: seeded via sessionStorage so the app skips LoginPage
 * (same pattern as helpers.ts / routing.spec.ts).
 *
 * Run once with --update-snapshots to generate baselines:
 *   npx playwright test tests/e2e/visual-polish.spec.ts --update-snapshots
 */

import { test, expect } from "@playwright/test";
import { seedFakeAuth } from "./helpers";

// All requests to the Xtream API will 404 in the test environment — that's fine.
// We're capturing the authenticated shell (skeleton/error states still have
// the polished atmosphere: gradient, dock, ambient fill).

test.beforeEach(async ({ page }) => {
  await seedFakeAuth(page);
});

test("live route — polished screenshot", async ({ page }) => {
  await page.goto("/live");
  // Allow skeletons / error state to settle (network will 401/404 in test env)
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("live-polished.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test("movies route — polished screenshot", async ({ page }) => {
  await page.goto("/movies");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("movies-polished.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test("series route — polished screenshot", async ({ page }) => {
  await page.goto("/series");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("series-polished.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test("search route — polished screenshot (empty state)", async ({ page }) => {
  await page.goto("/search");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("search-polished.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test("settings route — polished screenshot", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("settings-polished.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});
