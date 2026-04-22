/**
 * movies-browse.spec.ts — Production smoke test for the MoviesRoute.
 *
 * Exercises the real deployed app at STREAMVAULT_PROD_URL.
 * Credentials: STREAMVAULT_E2E_USER / STREAMVAULT_E2E_PASS.
 */
import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

test.describe("Movies browse — production", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test("dock Enter on Movies navigates to /movies and grid loads", async ({
    page,
  }) => {
    // Walk dock: Live(0) → Movies(1)
    await page.waitForTimeout(750);
    await page.keyboard.press("ArrowRight"); // → Movies
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Movies",
      { timeout: 3_000 },
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/movies/, { timeout: 10_000 });

    // Wait for real data: at least one movie card button
    const movieCard = page
      .locator('[data-page="movies"]')
      .locator("button")
      .first();
    await expect(movieCard).toBeVisible({ timeout: 15_000 });
  });

  test("ArrowRight walks movie cards (D-pad traversal)", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForSelector('[data-page="movies"]', { timeout: 10_000 });

    // Wait for cards to appear
    const firstCard = page.locator('[data-page="movies"] button').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // Focus first card and walk right
    await firstCard.focus();
    const labelBefore = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const labelAfter = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );

    // Focus moved (different card label)
    expect(labelAfter).not.toBe(labelBefore);
  });

  test("category strip renders and ArrowRight walks chips", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForSelector('[data-page="movies"]', { timeout: 10_000 });

    // Category strip or tablist must be present
    const strip = page
      .getByRole("tablist")
      .or(page.getByRole("toolbar"))
      .first();
    await expect(strip).toBeVisible({ timeout: 15_000 });

    const chips = strip.locator("button");
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);

    // Walk chips with keyboard
    await chips.first().focus();
    await page.keyboard.press("ArrowRight");
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label"),
    );
    expect(focused).toBeTruthy();
  });

  test("visual: movies page renders without overflow", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForSelector('[data-page="movies"]', { timeout: 10_000 });
    const firstCard = page.locator('[data-page="movies"] button').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot("movies-grid.png", {
      fullPage: false,
      mask: [page.locator('[data-page="movies"] button')],
    });
  });
});
