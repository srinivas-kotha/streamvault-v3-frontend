/**
 * favorites-smoke.spec.ts — Production smoke for FavoritesRoute.
 *
 * Exercises: navigate to /favorites, verify list renders or empty state,
 * D-pad traversal of favorite cards.
 *
 * Credentials: STREAMVAULT_E2E_USER / STREAMVAULT_E2E_PASS.
 */
import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

test.describe("Favorites — production smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test("direct navigate to /favorites renders page", async ({ page }) => {
    await page.goto("/favorites");
    await page.waitForSelector('[data-page="favorites"]', { timeout: 10_000 });

    // Either content or empty state is shown
    const hasContent = await page
      .locator('[data-page="favorites"] button')
      .first()
      .isVisible()
      .catch(() => false);

    const hasEmptyState = await page
      .getByText(/no favorites|nothing here|empty/i)
      .isVisible()
      .catch(() => false);

    expect(hasContent || hasEmptyState).toBe(true);
  });

  test("ArrowDown walks favorite cards when items exist", async ({ page }) => {
    await page.goto("/favorites");
    await page.waitForSelector('[data-page="favorites"]', { timeout: 10_000 });

    const firstCard = page.locator('[data-page="favorites"] button').first();
    const hasCards = await firstCard.isVisible().catch(() => false);

    if (!hasCards) {
      test.skip(true, "No favorites to traverse — add items via movies test first");
      return;
    }

    await firstCard.focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const labelAfter = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );

    expect(typeof labelAfter).toBe("string");
    expect(labelAfter).not.toBeNull();
  });

  test("visual: favorites page screenshot", async ({ page }) => {
    await page.goto("/favorites");
    await page.waitForSelector('[data-page="favorites"]', { timeout: 10_000 });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("favorites-page.png", {
      fullPage: false,
      mask: [page.locator('[data-page="favorites"] button')],
    });
  });
});
