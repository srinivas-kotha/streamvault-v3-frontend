/**
 * favorites-flow.spec.ts — dev E2E (Phase 8)
 *
 * Tests the full favorites flow against the local dev server with fake auth.
 *
 * Flow:
 *  1. Navigate to /favorites → empty state shown.
 *  2. Navigate to /settings → click "My Favorites" → /favorites.
 *  3. Navigate to /history → empty state shown.
 *  4. Both new routes render with correct data-page attributes.
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

  test("/settings shows My Favorites and Watch History menu items", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByText("My Favorites")).toBeVisible();
    await expect(page.getByText("Watch History")).toBeVisible();
  });

  test("clicking My Favorites in settings navigates to /favorites", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByText("My Favorites").click();
    await expect(page).toHaveURL(/\/favorites/);
    await expect(page.locator('[data-page="favorites"]')).toBeVisible();
  });

  test("clicking Watch History in settings navigates to /history", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByText("Watch History").click();
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

  test("back button from /favorites goes back", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("My Favorites").click();
    await expect(page).toHaveURL(/\/favorites/);

    await page.getByRole("button", { name: /go back/i }).click();
    await expect(page).toHaveURL(/\/settings/);
  });
});
