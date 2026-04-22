/**
 * performance-baseline.spec.ts — Loose FCP regression detector.
 *
 * Does NOT block merges. If this is too flaky in your environment,
 * mark it .skip() with a comment explaining the threshold.
 *
 * Budget: first-contentful-paint < 3000ms on desktop-chrome.
 * The goal is regression detection (e.g. accidentally importing hls.js
 * in the initial bundle), not absolute perf benchmarking.
 */
import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

// Only run on desktop-chrome — network conditions are reproducible there.
// fire-tv-1080p and webkit-ipad have different JS engine speeds.
test.describe("Performance baseline — production", () => {
  test("Live route FCP < 3000ms (desktop-chrome only)", async ({
    page,
  }, testInfo) => {
    // Skip on non-desktop-chrome projects to avoid flaky results
    if (testInfo.project.name !== "desktop-chrome") {
      test.skip(true, "Performance baseline only runs on desktop-chrome project");
      return;
    }

    await loginViaUI(page);

    // Clear performance buffer then navigate fresh
    await page.evaluate(() => performance.clearMarks());

    const t0 = Date.now();
    await page.goto("/live");
    await page.waitForSelector('[data-page="live"]', { timeout: 15_000 });

    const fcpMs: number = await page
      .evaluate(() => {
        // Use Performance API paint timing if available
        const entries = performance.getEntriesByType("paint");
        const fcp = entries.find((e) => e.name === "first-contentful-paint");
        if (fcp) return fcp.startTime;
        // Fallback: use navigation timing
        const nav = performance.getEntriesByType(
          "navigation",
        )[0] as PerformanceNavigationTiming | undefined;
        if (nav) return nav.domContentLoadedEventEnd - nav.startTime;
        return -1;
      })
      .catch(() => -1);

    if (fcpMs === -1) {
      // Measure wall-clock as a coarse fallback
      const wallMs = Date.now() - t0;
      test.info().annotations.push({
        type: "perf-fallback",
        description: `FCP API unavailable; wall-clock TTI: ${wallMs}ms`,
      });
      // Use a generous wall-clock budget (includes network RTT to VPS)
      expect(wallMs).toBeLessThan(10_000);
      return;
    }

    test.info().annotations.push({
      type: "fcp-ms",
      description: `FCP: ${fcpMs}ms`,
    });

    // 3000ms FCP budget — adjust if CDN or VPS location causes consistent failures
    expect(fcpMs).toBeLessThan(3_000);
  });

  test("Movies route time-to-interactive < 5000ms wall-clock", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "desktop-chrome") {
      test.skip(true, "Performance baseline only runs on desktop-chrome project");
      return;
    }

    await loginViaUI(page);

    const t0 = Date.now();
    await page.goto("/movies");
    await page.waitForSelector('[data-page="movies"]', { timeout: 15_000 });
    await page.locator('[data-page="movies"] button').first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    const tti = Date.now() - t0;

    test.info().annotations.push({
      type: "tti-ms",
      description: `Movies TTI: ${tti}ms`,
    });

    // 5s TTI budget for a fully-loaded grid (includes real API call to Xtream)
    expect(tti).toBeLessThan(5_000);
  });
});
