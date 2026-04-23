/**
 * favorites-flow.spec.ts — dev E2E (Phase 8)
 *
 * Tests the full favorites flow against the local dev server with fake auth.
 *
 * Flow:
 *  1. Navigate to /favorites → empty state shown.
 *  2. Navigate to /history → empty state shown.
 *  3. Both new routes render with correct data-page attributes.
 *
 * Navigation note: /favorites and /history are standalone routes reachable via
 * direct URL navigation (or from app links within content pages). The BottomDock
 * has 5 fixed tabs: Live, Movies, Series, Search, Settings — Favorites and
 * History do not appear in the dock.
 *
 * Note: Full star-toggle E2E requires backend + seeded data; that is tested
 * in favorites-smoke.spec.ts against the live URL. Here we test the UI shell
 * and navigation flow which works with fake auth + localStorage.
 */
import { test, expect } from "@playwright/test";
import { seedFakeAuth } from "./helpers";

test.describe("Favorites flow", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeAuth(page);
    // Seed empty favorites + history in localStorage.
    await page.addInitScript(() => {
      localStorage.setItem("sv_favorites", "[]");
      localStorage.setItem("sv_history", "[]");
    });
  });

  test("/favorites route renders with empty state", async ({ page }) => {
    await page.goto("/favorites");
    await expect(page.locator('[data-page="favorites"]')).toBeVisible();
    // Empty state message.
    await expect(page.getByText(/no favorites yet/i)).toBeVisible();
  });

  test("/history route renders with empty state", async ({ page }) => {
    await page.goto("/history");
    await expect(page.locator('[data-page="history"]')).toBeVisible();
    await expect(page.getByText(/nothing watched yet/i)).toBeVisible();
  });

  test("/favorites route has correct data-page attribute", async ({
    page,
  }) => {
    // The BottomDock does not contain Favorites/History tabs — navigate directly.
    await page.goto("/favorites");
    await expect(page).toHaveURL(/\/favorites/);
    await expect(page.locator('[data-page="favorites"]')).toBeVisible();
  });

  test("/history route has correct data-page attribute", async ({
    page,
  }) => {
    // The BottomDock does not contain Favorites/History tabs — navigate directly.
    await page.goto("/history");
    await expect(page).toHaveURL(/\/history/);
    await expect(page.locator('[data-page="history"]')).toBeVisible();
  });

  test("favorites show from localStorage without backend", async ({ page }) => {
    const favItem = {
      id: 1,
      content_type: "vod",
      content_id: 42,
      content_name: "Cached Movie",
      content_icon: null,
      category_name: "Action",
      sort_order: 1,
      added_at: new Date().toISOString(),
    };

    await page.addInitScript((item) => {
      localStorage.setItem("sv_favorites", JSON.stringify([item]));
    }, favItem);

    await page.goto("/favorites");
    // The fetch will fail (no real backend in dev E2E without server), but
    // localStorage fallback kicks in and shows the item.
    await expect(page.getByText("Cached Movie")).toBeVisible({ timeout: 5000 });
  });

  // FavoritesRoute currently has no in-app "Go back" button (the rebuild in
  // PR #96 dropped it). Restore this test if/when the button is re-introduced.
  test.skip("back button from /favorites goes back to previous page", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.locator('[data-page="settings"]')).toBeVisible();
    await page.goto("/favorites");
    await expect(page).toHaveURL(/\/favorites/);

    await page.getByRole("button", { name: /go back/i }).click();
    await expect(page).toHaveURL(/\/settings/);
  });
});
