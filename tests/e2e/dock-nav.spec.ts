import { test, expect } from "@playwright/test";
import { seedFakeAuth } from "./helpers";

/**
 * BottomDock D-pad navigation E2E (Task 2.4).
 *
 * Proves norigin@2.1.0 D-pad handlers wire through to the dock + React Router:
 *   - setFocus("DOCK_LIVE") primes norigin focus tree
 *   - ArrowRight → norigin routes spatial focus to DOCK_MOVIES (sibling)
 *   - Enter → DockTab.onEnterPress fires → useNavigate("/movies")
 *
 * **Why setFocus priming:** norigin tracks its own focus tree independently
 * of DOM `document.activeElement`. Clicking a button or pressing Tab only
 * updates DOM focus — it does NOT update norigin's internal `lastFocused`
 * pointer (verified via Task 2.4 debug session 2026-04-21). So ArrowRight
 * has nothing to navigate FROM and is a no-op.
 *
 * The app exposes `window.__svSetFocus` only in dev/test builds (main.tsx,
 * gated by `import.meta.env.DEV`) so Playwright can prime the focus tree
 * the same way a real user's first remote button press primes it on a TV.
 */
test.describe("BottomDock D-pad navigation", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeAuth(page);
    await page.goto("/live");
    // Wait for norigin init + App mount + BottomDock DockTabs registered.
    await page.waitForTimeout(300);
  });

  // Dock order is [Movies, Series, Live, Search, Settings] — Movies is
  // leftmost so ArrowRight from Movies lands on Series.
  test("ArrowRight moves focus from Movies to Series in dock", async ({
    page,
  }) => {
    await page.evaluate(() =>
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("DOCK_MOVIES"),
    );
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Movies",
      { timeout: 2000 },
    );

    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Series",
      { timeout: 2000 },
    );
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
    ).toBe("Series");
  });

  test("Enter on dock item navigates to that route", async ({ page }) => {
    await page.evaluate(() =>
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("DOCK_MOVIES"),
    );
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Movies",
      { timeout: 2000 },
    );
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Series",
      { timeout: 2000 },
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/series/);
    await expect(page.locator('[data-page="series"]')).toBeVisible();
  });

  test("dock is visible on /live and /movies", async ({ page }) => {
    await expect(
      page.locator('nav[aria-label="Main navigation"]'),
    ).toBeVisible();
    await page.goto("/movies");
    await expect(
      page.locator('nav[aria-label="Main navigation"]'),
    ).toBeVisible();
  });

  test("dock is hidden on dev-time probe routes (/test-primitives, /silk-probe)", async ({
    page,
  }) => {
    await page.goto("/test-primitives");
    await expect(page.locator('nav[aria-label="Main navigation"]')).toHaveCSS(
      "opacity",
      "0",
    );
    await page.goto("/silk-probe");
    await expect(page.locator('nav[aria-label="Main navigation"]')).toHaveCSS(
      "opacity",
      "0",
    );
  });
});
