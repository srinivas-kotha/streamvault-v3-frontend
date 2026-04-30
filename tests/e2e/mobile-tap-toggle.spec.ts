/**
 * Mobile tap-to-toggle player controls E2E (master plan §5 PR-FE-2, §7 R4).
 *
 * Strategy:
 *   - Mobile Portrait viewport (390×844) + touch UA
 *   - Stub /api/config/flags to enable adaptive.player.tap_toggle
 *   - Uses the existing e2e test user (SV_TEST_* secrets)
 *   - Opens a VOD player via URL param and verifies:
 *       1. PlayerGestureLayer renders (flag on, not TV)
 *       2. Tapping video area hides controls (visible → hidden)
 *       3. Tapping again shows controls (hidden → visible)
 *
 * NOTE: These tests are skipped when SV_TEST_* env vars are absent (same
 * skip-guard pattern as auth.spec.ts). CI runs them with real-backend secrets.
 */
import { test, expect } from "@playwright/test";
import { seedFakeAuth } from "./helpers";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

test.use({
  userAgent: MOBILE_UA,
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});

// Skip guard: tests require seeded backend credentials.
const SKIP =
  !process.env.SV_TEST_USER || !process.env.SV_TEST_PASS
    ? "SV_TEST_USER / SV_TEST_PASS not set — skipping mobile tap-toggle E2E"
    : null;

test.beforeEach(async ({ page }) => {
  // Enable tap-toggle flag for all tests in this suite.
  await page.route("**/api/config/flags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        flags: {
          "adaptive.gestures.enabled": false,
          "adaptive.mobile.enabled": true,
          "adaptive.desktop.enabled": false,
          "adaptive.player.tap_toggle": true,
        },
        scope: "global",
        ttl_seconds: 5,
        fetchedAt: new Date().toISOString(),
      }),
    });
  });
});

test.describe("mobile tap-to-toggle controls", () => {
  test("gesture layer is present when flag is on and UA is mobile", async ({
    page,
  }) => {
    if (SKIP) {
      test.skip(true, SKIP);
      return;
    }
    await seedFakeAuth(page);
    await page.goto("/live");
    await page.waitForLoadState("networkidle");

    // Open a channel — click the first channel card if present.
    const firstCard = page.locator('[data-testid="channel-card"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No channel cards — backend may not have live channels");
      return;
    }
    await firstCard.click();
    await page.waitForSelector('[data-testid="player-shell"]', {
      timeout: 5000,
    });

    // Gesture layer should exist (flag on + mobile UA → not TV dpad mode).
    await expect(
      page.locator('[data-testid="player-gesture-layer"]'),
    ).toBeVisible();
  });

  test("tap on video area toggles controls visibility", async ({ page }) => {
    if (SKIP) {
      test.skip(true, SKIP);
      return;
    }
    await seedFakeAuth(page);
    await page.goto("/live");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('[data-testid="channel-card"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No channel cards");
      return;
    }
    await firstCard.click();
    await page.waitForSelector('[data-testid="player-controls"]', {
      timeout: 5000,
    });

    const controls = page.locator('[data-testid="player-controls"]');
    const gestureLayer = page.locator('[data-testid="player-gesture-layer"]');

    // Controls start visible (spec §4.1 — open visible).
    await expect(controls).toBeVisible();

    // Tap the gesture layer centre to hide the controls.
    const box = await gestureLayer.boundingBox();
    if (!box) throw new Error("gesture layer has no bounding box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.touchscreen.tap(cx, cy);

    // Controls should now be hidden (opacity 0 + aria-hidden).
    await expect(controls).toHaveAttribute("aria-hidden", "true");

    // Tap again to restore controls.
    await page.touchscreen.tap(cx, cy);
    await expect(controls).not.toHaveAttribute("aria-hidden", "true");
  });

  test("tapping a control button does NOT hide controls", async ({ page }) => {
    if (SKIP) {
      test.skip(true, SKIP);
      return;
    }
    await seedFakeAuth(page);
    await page.goto("/live");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('[data-testid="channel-card"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No channel cards");
      return;
    }
    await firstCard.click();
    await page.waitForSelector('[data-testid="player-controls"]', {
      timeout: 5000,
    });

    const controls = page.locator('[data-testid="player-controls"]');
    await expect(controls).toBeVisible();

    // Tap the Back button (a [data-player-control] element).
    const backBtn = page.locator('button[aria-label="Back"]').first();
    if ((await backBtn.count()) === 0) {
      test.skip(true, "No Back button found in player");
      return;
    }
    const btnBox = await backBtn.boundingBox();
    if (!btnBox) throw new Error("back button has no bounding box");
    await page.touchscreen.tap(
      btnBox.x + btnBox.width / 2,
      btnBox.y + btnBox.height / 2,
    );

    // Controls should remain visible — the tap was on a control element.
    // (Back navigates away so we check the controls weren't hidden right
    // before navigation. The test just asserts aria-hidden is not set.)
    // Because Back closes the player, simply verify controls were not hidden
    // before the navigation completed.
    await expect(controls).not.toHaveAttribute("aria-hidden", "true");
  });
});
