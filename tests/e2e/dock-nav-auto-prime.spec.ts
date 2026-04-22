import { test, expect } from "@playwright/test";
import { seedFakeAuth } from "./helpers";

/**
 * BottomDock auto-prime E2E.
 *
 * Proves the AppShell mount-effect primes norigin's focus tree onto the
 * active dock tab. WITHOUT this fix, a real user landing on the live URL
 * after login sees the dock but arrow keys do nothing — norigin has no
 * `lastFocused` anchor. Existing `dock-nav.spec.ts` side-steps the bug by
 * calling `__svSetFocus("DOCK_LIVE")` itself; this spec explicitly does NOT.
 *
 * The difference versus `dock-nav.spec.ts`: no `__svSetFocus()` call before
 * pressing arrows. If AppShell's useEffect is removed, ArrowRight becomes a
 * no-op and this test fails.
 */
test.describe("BottomDock auto-prime (AppShell useEffect)", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeAuth(page);
    await page.goto("/live");
    // Let norigin init + useFocusable registrations + AppShell useEffect run.
    await page.waitForTimeout(500);
  });

  test("focus lands on DOCK_LIVE on first paint without manual priming", async ({
    page,
  }) => {
    const label = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    );
    expect(label).toBe("Live");
  });

  test("ArrowRight moves from Live to Movies without __svSetFocus priming", async ({
    page,
  }) => {
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Movies",
      { timeout: 2000 },
    );
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
    ).toBe("Movies");
  });

  test("ArrowRight walks the whole dock: Live -> Movies -> Series -> Search -> Settings", async ({
    page,
  }) => {
    const expected = ["Live", "Movies", "Series", "Search", "Settings"];
    for (let i = 0; i < expected.length; i += 1) {
      const want = expected[i];
      await page.waitForFunction(
        (label) =>
          document.activeElement?.getAttribute("aria-label") === label,
        want,
        { timeout: 2000 },
      );
      if (i < expected.length - 1) {
        await page.keyboard.press("ArrowRight");
      }
    }
  });

  test("deep-linking to /movies primes focus on DOCK_MOVIES", async ({
    page,
  }) => {
    await page.goto("/movies");
    await page.waitForTimeout(500);
    const label = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    );
    expect(label).toBe("Movies");
  });
});
