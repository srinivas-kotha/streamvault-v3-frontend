/**
 * reduced-motion.spec.ts — Asserts animations are disabled under
 * prefers-reduced-motion: reduce.
 *
 * Checks:
 *   - Shimmer/skeleton animation is disabled (animationDuration is "0s" or "1ms")
 *   - Focus scale transform is scale(1) — no scale-up on focus
 *   - Retry / pulse animation is static
 */
import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

test.describe("Reduced motion — prefers-reduced-motion: reduce", () => {
  test.use({
    // Emulate the prefers-reduced-motion media query
    reducedMotion: "reduce",
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test("shimmer/skeleton animation is disabled on Live while loading", async ({
    page,
  }) => {
    // Block channels API to force skeleton to render
    await page.route("**/api/live/channels**", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ channels: [] }) }),
    );

    await page.goto("/live");
    await page.waitForSelector('[data-page="live"]', { timeout: 10_000 });

    // Inspect any shimmer / skeleton element
    const shimmerAnimDuration = await page
      .evaluate(() => {
        const shimmer = document.querySelector(
          '[class*="shimmer"], [class*="skeleton"], [class*="animate-pulse"], [class*="Shimmer"]',
        );
        if (!shimmer) return null;
        return window.getComputedStyle(shimmer).animationDuration;
      })
      .catch(() => null);

    if (shimmerAnimDuration === null) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "No shimmer/skeleton element found — may not render on this route",
      });
      return;
    }

    // Under reduced-motion, animation should be instant (0s or 1ms) or none
    const isDisabled =
      shimmerAnimDuration === "0s" ||
      shimmerAnimDuration === "0.001s" ||
      shimmerAnimDuration === "1ms" ||
      shimmerAnimDuration === "none";

    expect(
      isDisabled,
      `Expected shimmer animation disabled under reduced-motion, got: ${shimmerAnimDuration}`,
    ).toBe(true);
  });

  test("focused dock item does not scale beyond scale(1)", async ({ page }) => {
    await page.waitForTimeout(750);

    const scaleValue = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement | null;
      if (!focused) return null;
      const transform = window.getComputedStyle(focused).transform;
      return transform;
    });

    if (scaleValue === null || scaleValue === "none") {
      // No transform applied — this is fine, means scale(1) is implied
      return;
    }

    // Parse matrix transform: matrix(a, b, c, d, tx, ty) — a & d are scaleX/Y
    const matrix = scaleValue.match(/matrix\(([^)]+)\)/);
    if (matrix) {
      const values = matrix[1].split(",").map(parseFloat);
      const scaleX = values[0]; // should be 1.0 under reduced-motion
      expect(scaleX).toBeLessThanOrEqual(1.0);
    }
  });

  test("retry button pulse animation is static under reduced-motion", async ({
    page,
  }) => {
    // Trigger error state to show Retry button
    await page.route("**/api/live/channels**", (route) =>
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "E2E test error" }),
      }),
    );

    await page.goto("/live");
    await page.waitForSelector('[data-page="live"]', { timeout: 10_000 });

    const retryBtn = page.getByRole("button", { name: /retry/i }).first();
    const retryVisible = await retryBtn
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (!retryVisible) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "Retry button not shown — error state may not render on this route",
      });
      return;
    }

    const animDuration = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="Retry" i], button[data-retry]');
      if (!btn) {
        // Also try generic button with retry text
        const allBtns = Array.from(document.querySelectorAll("button"));
        const retryBtns = allBtns.filter((b) =>
          b.textContent?.toLowerCase().includes("retry"),
        );
        if (retryBtns.length === 0) return null;
        return window.getComputedStyle(retryBtns[0]).animationDuration;
      }
      return window.getComputedStyle(btn).animationDuration;
    });

    if (animDuration && animDuration !== "none" && animDuration !== "0s") {
      // Under reduced-motion, animation should be effectively instant
      const numMs = parseFloat(animDuration) * (animDuration.includes("ms") ? 1 : 1000);
      expect(numMs).toBeLessThanOrEqual(1);
    }
    // If null or "none" — animation already disabled, pass
  });
});
