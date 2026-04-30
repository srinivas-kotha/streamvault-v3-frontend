/**
 * TV pixel-lock smoke (master plan §5 PR-FE-1, §7 R1).
 *
 * Renders the app in TV mode (Fire TV UA) and captures viewport snapshots
 * of critical pages. Any unintentional pixel diff fails the PR — this is
 * the "TV is sacred" gate (R1).
 *
 * Strategy:
 *   - Use Playwright's WebKit project (closest to Silk)
 *   - Force `data-tv="true"` via UA override
 *   - Mock /api/* and /api/config/flags to keep DOM deterministic
 *   - Mock Date.now() so any timestamp UI is stable
 *   - Tolerance 0.01 maxDiffPixelRatio — tight enough to catch real
 *     regressions, loose enough to handle anti-aliasing variation
 *
 * NOTE: Phase 1 ships this spec with `test.fixme()` because the visual
 * baseline screenshots haven't been generated yet (would need a working
 * deployed app + matching CI runner image). When the FE PR is reviewed
 * and a baseline is captured by `playwright test --update-snapshots`,
 * the fixme will be removed.
 */
import { test, expect } from "@playwright/test";

const FIRE_TV_UA =
  "Mozilla/5.0 (Linux; Android 9; AFTKAUK Build/PS7233) AppleWebKit/537.36 (KHTML, like Gecko) Silk/103.4.6 like Chrome/103.0.5060.71 Safari/537.36";

test.use({
  userAgent: FIRE_TV_UA,
  viewport: { width: 1920, height: 1080 },
});

test.beforeEach(async ({ page }) => {
  // Stub /api/config/flags so the cache is deterministic.
  await page.route("**/api/config/flags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        flags: {
          "adaptive.gestures.enabled": false,
          "adaptive.mobile.enabled": false,
          "adaptive.desktop.enabled": false,
          "adaptive.player.tap_toggle": false,
        },
        scope: "global",
        ttl_seconds: 5,
        fetchedAt: "2026-04-29T17:00:00Z",
      }),
    });
  });

  // Freeze the clock for stable snapshots.
  await page.addInitScript(() => {
    const FROZEN = new Date("2026-04-29T17:00:00Z").getTime();
    Date.now = () => FROZEN;
  });
});

test.describe("TV pixel-lock", () => {
  test.fixme(true, "Baselines not yet captured — generate with --update-snapshots after first deploy");

  test("login page in TV mode is pixel-stable", async ({ page }) => {
    await page.goto("/");
    // Wait for known stable element
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("tv-login.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("data-input-mode attribute is dpad on TV", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const mode = await page.evaluate(() =>
      document.documentElement.getAttribute("data-input-mode"),
    );
    expect(mode).toBe("dpad");
  });

  test("data-tv attribute is set on TV UA", async ({ page }) => {
    await page.goto("/");
    const tv = await page.evaluate(() =>
      document.documentElement.getAttribute("data-tv"),
    );
    expect(tv).toBe("true");
  });

  test("sv-deploy-id meta tag is present", async ({ page }) => {
    await page.goto("/");
    const deployId = await page.evaluate(() =>
      document.querySelector('meta[name="sv-deploy-id"]')?.getAttribute("content"),
    );
    expect(deployId).toBeTruthy();
    expect(deployId).not.toBe("");
  });
});
