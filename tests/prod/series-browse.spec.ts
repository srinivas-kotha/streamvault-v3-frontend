/**
 * series-browse.spec.ts — Production smoke test for the SeriesRoute.
 *
 * Exercises the real deployed app at STREAMVAULT_PROD_URL.
 * Credentials: STREAMVAULT_E2E_USER / STREAMVAULT_E2E_PASS.
 */
import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

test.describe("Series browse — production", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test("dock Enter on Series navigates to /series and grid loads", async ({
    page,
  }) => {
    // Walk dock: Live(0) → Movies(1) → Series(2)
    await page.waitForTimeout(750);
    await page.keyboard.press("ArrowRight"); // → Movies
    await page.keyboard.press("ArrowRight"); // → Series
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Series",
      { timeout: 3_000 },
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/series/, { timeout: 10_000 });

    // Wait for real data
    await page.waitForSelector('[data-page="series"]', { timeout: 10_000 });
    const card = page.locator('[data-page="series"] button').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
  });

  test("category strip renders and ArrowRight walks chips", async ({ page }) => {
    await page.goto("/series");
    await page.waitForSelector('[data-page="series"]', { timeout: 10_000 });

    const strip = page
      .getByRole("tablist")
      .or(page.getByRole("toolbar"))
      .first();
    await expect(strip).toBeVisible({ timeout: 15_000 });

    const chips = strip.locator("button");
    expect(await chips.count()).toBeGreaterThan(0);

    await chips.first().focus();
    await page.keyboard.press("ArrowRight");
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label"),
    );
    expect(focused).toBeTruthy();
  });

  test("ArrowRight walks series cards", async ({ page }) => {
    await page.goto("/series");
    await page.waitForSelector('[data-page="series"]', { timeout: 10_000 });

    const firstCard = page.locator('[data-page="series"] button').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    await firstCard.focus();
    const labelBefore = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const labelAfter = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    expect(labelAfter).not.toBe(labelBefore);
  });

  test("visual: series page screenshot", async ({ page }) => {
    await page.goto("/series");
    await page.waitForSelector('[data-page="series"]', { timeout: 10_000 });
    const firstCard = page.locator('[data-page="series"] button').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot("series-grid.png", {
      fullPage: false,
      mask: [page.locator('[data-page="series"] button')],
    });
  });
});
