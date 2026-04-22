/**
 * tv-viewport.spec.ts — Fire TV 1920x1080 visual regression.
 *
 * Only runs on the fire-tv-1080p project (1920x1080 viewport).
 *
 * Asserts:
 *   - No horizontal overflow (scrollWidth <= clientWidth)
 *   - Dock is visible and full-width
 *   - Per-route screenshots for visual QA
 */
import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

const ROUTES: Array<{ name: string; path: string; dataPage: string }> = [
  { name: "live",     path: "/live",     dataPage: "live" },
  { name: "movies",   path: "/movies",   dataPage: "movies" },
  { name: "series",   path: "/series",   dataPage: "series" },
  { name: "search",   path: "/search",   dataPage: "search" },
  { name: "settings", path: "/settings", dataPage: "settings" },
];

test.describe("TV viewport (1920x1080) — fire-tv-1080p only", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "fire-tv-1080p") {
      test.skip(true, "tv-viewport tests only run on fire-tv-1080p project");
      return;
    }
    await loginViaUI(page);
  });

  test("root element is full viewport width (no black bars)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "fire-tv-1080p") {
      test.skip(true, "tv-viewport tests only run on fire-tv-1080p project");
      return;
    }

    const { rootWidth, viewportWidth } = await page.evaluate(() => ({
      rootWidth: document.getElementById("root")?.clientWidth ?? 0,
      viewportWidth: window.innerWidth,
    }));
    expect(rootWidth).toBe(viewportWidth);
  });

  test("dock is visible and spans full width", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "fire-tv-1080p") {
      test.skip(true, "tv-viewport tests only run on fire-tv-1080p project");
      return;
    }

    const dock = page.locator('nav[aria-label="Main navigation"]');
    await expect(dock).toBeVisible({ timeout: 5_000 });

    const dockBounds = await dock.boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(dockBounds).not.toBeNull();
    if (dockBounds) {
      // Dock must span at least 95% of viewport width
      expect(dockBounds.width).toBeGreaterThan(viewportWidth * 0.95);
    }
  });

  for (const route of ROUTES) {
    test(`${route.name} — no horizontal overflow at 1920x1080`, async ({
      page,
    }, testInfo) => {
      if (testInfo.project.name !== "fire-tv-1080p") {
        test.skip(true, "tv-viewport tests only run on fire-tv-1080p project");
        return;
      }

      await page.goto(route.path);
      await page.waitForSelector(`[data-page="${route.dataPage}"]`, {
        timeout: 15_000,
      });
      await page.waitForTimeout(500);

      // Check for horizontal overflow
      const overflow = await page.evaluate(() => ({
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        htmlScrollWidth: document.documentElement.scrollWidth,
        htmlClientWidth: document.documentElement.clientWidth,
      }));

      // No horizontal overflow allowed
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(
        overflow.bodyClientWidth + 2, // 2px tolerance for sub-pixel rendering
      );
      expect(overflow.htmlScrollWidth).toBeLessThanOrEqual(
        overflow.htmlClientWidth + 2,
      );
    });

    test(`${route.name} — visual screenshot at 1920x1080`, async ({
      page,
    }, testInfo) => {
      if (testInfo.project.name !== "fire-tv-1080p") {
        test.skip(true, "tv-viewport tests only run on fire-tv-1080p project");
        return;
      }

      await page.goto(route.path);
      await page.waitForSelector(`[data-page="${route.dataPage}"]`, {
        timeout: 15_000,
      });

      // Wait for data to load before snapping
      await page.waitForTimeout(1_000);

      await expect(page).toHaveScreenshot(`tv-${route.name}-1080p.png`, {
        fullPage: false,
        mask: [
          page.locator("[data-epg-now]"),
          page.locator("[data-channel-row]"),
          page.locator("[data-dynamic]"),
        ],
      });
    });
  }
});
