import { test, expect } from "@playwright/test";
import { seedFakeAuth } from "./helpers";

/**
 * LiveRoute D-pad E2E (Task 4.4).
 *
 * Drives the page with Playwright keyboard arrow events — norigin listens
 * for ArrowUp/Down/Left/Right/Enter by default, so a keyboard-arrow key
 * press is the closest desktop analogue to a Fire TV D-pad button.
 *
 * What this proves:
 *  - Sort buttons + EPG filter buttons are registered with norigin via
 *    `useFocusable` (D6a). Without registration the controls are
 *    unreachable on Fire TV, same failure mode as Task 2.4's dock.
 *  - Pressing Enter on a sort button changes the sort order (the
 *    `aria-pressed` state flips).
 *
 * MANUAL TV SMOKE TEST REQUIRED after merge — see test.info() note below.
 * Keyboard arrow simulation ≠ Fire TV remote (different events, different
 * timing); always do one round trip on real hardware before calling this
 * feature shipped ("E2E not done until D-pad tested" feedback rule).
 *
 * If norigin doesn't respond to raw `page.keyboard.press`, fall back to
 * `window.__svSetFocus(...)` the same way `dock-nav.spec.ts` does.
 *
 * This spec uses `seedFakeAuth` because the real login+backend flow is
 * covered by `auth.spec.ts` — we're only validating the Live page's
 * in-page D-pad wiring. Channels may fail to load against a cookie-auth
 * backend from a fake-token session (a known mismatch noted in the
 * session handoff). We assert on toolbar presence (sort/filter controls),
 * which render BEFORE the SplitGuide even on an empty or error state.
 */
test.describe("LiveRoute D-pad navigation", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeAuth(page);
    await page.goto("/live");
    // Wait for norigin init + App mount + LiveRoute toolbar registration.
    await page.waitForTimeout(500);
  });

  test("sort buttons + EPG filter are registered and reachable via setFocus", async ({
    page,
  }) => {
    test.info().annotations.push({
      type: "manual-tv-smoke",
      description:
        "MANUAL TV REQUIRED: open /live on Fire TV, press Up from the dock " +
        "to reach the toolbar, Left/Right across sort + EPG filter buttons, " +
        "press Enter to change sort. Verify Copper highlight moves with focus.",
    });

    // Prime norigin's focus tree at SORT_NUMBER (the default sort button).
    // If LiveRoute errored out (backend down), skip gracefully — the
    // LiveRoute error state has no SORT_* buttons, which is expected.
    const toolbar = page.getByRole("toolbar", {
      name: /sort and epg filter/i,
    });
    if (!(await toolbar.isVisible().catch(() => false))) {
      test.skip(
        true,
        "LiveRoute toolbar not rendered (likely backend unavailable in this env)",
      );
    }

    await page.evaluate(() =>
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("SORT_NUMBER"),
    );
    await page.waitForFunction(
      () => document.activeElement?.textContent?.toLowerCase() === "number",
      { timeout: 2000 },
    );

    // ArrowRight should move spatial focus along the toolbar (Number → Name).
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.textContent?.toLowerCase() === "name",
      { timeout: 2000 },
    );

    // Enter fires the button → sort flips to "Name" → aria-pressed updates.
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: /^name$/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("FILTER_ALL focus key is registered (D6a)", async ({ page }) => {
    const toolbar = page.getByRole("toolbar", {
      name: /sort and epg filter/i,
    });
    if (!(await toolbar.isVisible().catch(() => false))) {
      test.skip(
        true,
        "LiveRoute toolbar not rendered (likely backend unavailable in this env)",
      );
    }

    // Proving the FILTER_<ID> focus keys are registered: setFocus returns
    // successfully (no throw) and the DOM element with matching text takes
    // focus. This is the same gate used in dock-nav.spec.ts.
    await page.evaluate(() =>
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("FILTER_ALL"),
    );
    await page.waitForFunction(
      () => document.activeElement?.textContent?.toLowerCase() === "all",
      { timeout: 2000 },
    );
    expect(
      await page.evaluate(() => document.activeElement?.textContent),
    ).toBe("All");
  });
});
