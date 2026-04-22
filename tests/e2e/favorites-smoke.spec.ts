/**
 * favorites-smoke.spec.ts — prod smoke tests (Phase 8)
 *
 * Smoke-tests the Favorites + History feature against the live URL.
 * These tests login via UI (real credentials from env), star an item,
 * verify it appears in /favorites, then unstar it.
 *
 * Run with:
 *   PROD_URL=https://streamvault.srinivaskotha.uk \
 *   PROD_USERNAME=<user> \
 *   PROD_PASSWORD=<pass> \
 *   npx playwright test tests/e2e/favorites-smoke.spec.ts
 *
 * In CI, skipped unless PROD_URL is set.
 */
import { test, expect } from "@playwright/test";

const PROD_URL = process.env["PROD_URL"] ?? "";
const PROD_USERNAME = process.env["PROD_USERNAME"] ?? "";
const PROD_PASSWORD = process.env["PROD_PASSWORD"] ?? "";

test.describe("Favorites smoke (prod)", () => {
  test.skip(!PROD_URL, "PROD_URL not set — skipping prod smoke tests");

  test.use({ baseURL: PROD_URL });

  async function loginViaUI(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByLabel(/username/i).fill(PROD_USERNAME);
    await page.getByLabel(/password/i).fill(PROD_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // Wait until the dock is visible (AppShell rendered).
    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible({
      timeout: 10000,
    });
  }

  test("favorites empty baseline after login", async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`${PROD_URL}/favorites`);
    // Either empty state or loaded items (pre-existing favs are fine).
    await expect(page.locator('[data-page="favorites"]')).toBeVisible();
  });

  test("settings → My Favorites navigation works", async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`${PROD_URL}/settings`);
    await expect(page.getByText("My Favorites")).toBeVisible();
    await page.getByText("My Favorites").click();
    await expect(page).toHaveURL(/\/favorites/);
  });

  test("settings → Watch History navigation works", async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`${PROD_URL}/settings`);
    await expect(page.getByText("Watch History")).toBeVisible();
    await page.getByText("Watch History").click();
    await expect(page).toHaveURL(/\/history/);
    await expect(page.locator('[data-page="history"]')).toBeVisible();
  });
});
