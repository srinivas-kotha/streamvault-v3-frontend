import { test, expect } from "@playwright/test";
import { loginViaUI, activeLabel } from "./helpers";

/**
 * End-to-end smoke on the live site: login → dock auto-primes → D-pad walks
 * the whole dock → Enter navigates routes.
 *
 * Also takes a visual-regression screenshot per project so a regression on
 * layout (e.g. reintroducing the 1126px #root cap that produced black left/
 * right bars) fails the check.
 */
test.describe("prod: login + dock D-pad", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test("dock auto-primes focus on Live after login (no manual focus call)", async ({
    page,
  }) => {
    // Give AppShell's mount useEffect + norigin registrations a beat.
    await page.waitForTimeout(750);
    expect(await activeLabel(page)).toBe("Live");
  });

  test("ArrowRight walks the entire dock: Live -> Movies -> Series -> Search -> Settings", async ({
    page,
  }) => {
    await page.waitForTimeout(750);
    const items = ["Live", "Movies", "Series", "Search", "Settings"];
    for (let i = 0; i < items.length; i += 1) {
      await page.waitForFunction(
        (want) =>
          document.activeElement?.getAttribute("aria-label") === want,
        items[i],
        { timeout: 3000 },
      );
      if (i < items.length - 1) await page.keyboard.press("ArrowRight");
    }
  });

  test("Enter on Movies tab navigates to /movies", async ({ page }) => {
    await page.waitForTimeout(750);
    await page.keyboard.press("ArrowRight"); // Live → Movies
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/movies/);
    await expect(page.locator('[data-page="movies"]')).toBeVisible();
  });

  test("visual: dashboard renders full-bleed (no black side bars)", async ({
    page,
  }) => {
    await page.waitForTimeout(1000);
    // Sanity: #root width must equal the viewport width — catches the
    // regression where the Vite-template CSS capped #root at 1126px.
    const { rootWidth, viewportWidth } = await page.evaluate(() => ({
      rootWidth: document.getElementById("root")?.clientWidth ?? 0,
      viewportWidth: window.innerWidth,
    }));
    expect(rootWidth).toBe(viewportWidth);

    await expect(page).toHaveScreenshot("dashboard-live.png", {
      fullPage: false,
      mask: [
        // Mask dynamic content so the baseline is stable: channel rows,
        // EPG now-line, timestamps, channel numbers.
        page.locator('[data-epg-now="true"]'),
        page.locator("[data-channel-row]"),
      ],
    });
  });
});
