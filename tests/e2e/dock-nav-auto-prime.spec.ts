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
    // The prime has a 100ms defer + up to 10 retries at 50ms = ~600ms worst
    // case; 1500ms gives plenty of head room.
    await page.waitForTimeout(1500);
  });

  test("focus lands on DOCK_LIVE on first paint without manual priming", async ({
    page,
  }) => {
    const label = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    );
    expect(label).toBe("Live");
  });

  // Dock order is [Movies, Series, Live, Search, Settings]. Deep-linking to
  // /live focuses DOCK_LIVE (position 3), so ArrowRight lands on Search.
  test("ArrowRight moves from Live to Search without __svSetFocus priming", async ({
    page,
  }) => {
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Search",
      { timeout: 2000 },
    );
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
    ).toBe("Search");
  });

  test("ArrowRight walks the whole dock: Movies -> Series -> Live -> Search -> Settings", async ({
    page,
  }) => {
    // Walk starts from leftmost tab, so navigate to /movies first (overriding
    // the beforeEach goto("/live")) to prime focus on DOCK_MOVIES.
    await page.goto("/movies");
    await page.waitForTimeout(1500);
    const expected = ["Movies", "Series", "Live", "Search", "Settings"];
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
    await page.waitForTimeout(1500);
    const label = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    );
    expect(label).toBe("Movies");
  });
});
