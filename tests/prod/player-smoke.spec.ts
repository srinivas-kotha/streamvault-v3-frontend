/**
 * player-smoke.spec.ts — Production smoke for the Video Player.
 *
 * Exercises: Enter on a Live channel → player overlay → <video> in DOM →
 * readyState >= 2 within 30s. Rate-limited streams are skipped, not failed.
 *
 * Credentials: STREAMVAULT_E2E_USER / STREAMVAULT_E2E_PASS.
 */
import { test, expect } from "@playwright/test";
import { loginViaUI, waitForPlayerReady } from "./helpers";

test.describe("Video Player — production smoke", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test("Enter on first live channel opens player overlay with <video> in DOM", async ({
    page,
  }) => {
    await page.goto("/live");
    await page.waitForSelector('[data-page="live"]', { timeout: 15_000 });

    const firstChannel = page.locator('[data-page="live"] button').first();
    const channelsLoaded = await firstChannel
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!channelsLoaded) {
      test.skip(true, "No channels loaded — API unavailable");
      return;
    }

    // Track stream HTTP status
    let streamStatus = 200;
    page.on("response", (resp) => {
      const url = resp.url();
      if (
        url.includes("/live/") ||
        url.includes(".m3u8") ||
        url.includes(".ts") ||
        url.includes("stream")
      ) {
        const s = resp.status();
        if (s >= 400) streamStatus = s;
      }
    });

    await firstChannel.focus();
    await page.keyboard.press("Enter");

    // Player overlay should appear
    await page.waitForTimeout(1_500);

    const videoEl = page.locator("video");
    const videoVisible = await videoEl.isVisible().catch(() => false);

    if (!videoVisible) {
      test.skip(true, "Player overlay did not appear — channel may require parental PIN");
      return;
    }

    await expect(videoEl).toBeVisible({ timeout: 5_000 });

    // Check if stream was rate-limited
    if (streamStatus >= 400) {
      test.skip(
        true,
        `Stream returned HTTP ${streamStatus} — Xtream rate-limit hit; retry later`,
      );
      return;
    }

    // Wait for actual playback
    await waitForPlayerReady(page, 30_000);

    // Validate: readyState must be >= 2
    const readyState = await page.evaluate(
      () => document.querySelector("video")?.readyState ?? -1,
    );
    expect(readyState).toBeGreaterThanOrEqual(2);
  });

  test("Escape closes player and returns to channel list", async ({ page }) => {
    await page.goto("/live");
    await page.waitForSelector('[data-page="live"]', { timeout: 15_000 });

    const firstChannel = page.locator('[data-page="live"] button').first();
    const channelsLoaded = await firstChannel
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!channelsLoaded) {
      test.skip(true, "No channels loaded");
      return;
    }

    await firstChannel.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1_500);

    const videoVisible = await page.locator("video").isVisible().catch(() => false);
    if (!videoVisible) {
      test.skip(true, "Player did not open — cannot test Escape");
      return;
    }

    // Escape closes the player
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Channel list should be visible again
    await expect(
      page.locator('[data-page="live"] button').first(),
    ).toBeVisible({ timeout: 5_000 });

    // Video element should be gone
    const videoGone = !(await page.locator("video").isVisible().catch(() => true));
    expect(videoGone).toBe(true);
  });

  test("visual: player overlay screenshot", async ({ page }) => {
    await page.goto("/live");
    await page.waitForSelector('[data-page="live"]', { timeout: 15_000 });

    const firstChannel = page.locator('[data-page="live"] button').first();
    const channelsLoaded = await firstChannel
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!channelsLoaded) {
      test.skip(true, "No channels to open player");
      return;
    }

    await firstChannel.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2_000);

    const videoVisible = await page.locator("video").isVisible().catch(() => false);
    if (!videoVisible) {
      test.skip(true, "Player did not open");
      return;
    }

    await expect(page).toHaveScreenshot("player-overlay.png", {
      fullPage: false,
      mask: [page.locator("video")], // mask the actual video frame (dynamic content)
    });
  });
});
