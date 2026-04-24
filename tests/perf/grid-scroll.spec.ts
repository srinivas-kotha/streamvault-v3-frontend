import { test, expect, type PerfMetrics } from "./fixtures";

/**
 * D-pad grid scroll: press ArrowDown ×30 through Movies (virtualized via
 * react-virtuoso) and Series (plain CSS Grid, NOT virtualized — known
 * hotspot, see plan §Known hotspots item 4). Measure dropped frames.
 *
 * Dropped frame = rAF delta > 32ms (missed 60fps budget of 16.67ms, with
 * 2× headroom). Report % of total sampled frames.
 */

const PRESSES = 30;

for (const route of ["movies", "series"] as const) {
  test(`grid scroll (${route}): D-pad Down ×${PRESSES}, dropped frame %`, async ({
    perfPage,
    routeReady,
    harvest,
    cpuRate,
  }, testInfo) => {
    // Auth pre-seeded via global-setup + storageState.
    await perfPage.goto(`/${route}`);
    await routeReady(`[data-page="${route}"]`);
    await perfPage.waitForTimeout(2000); // Let list fully paint + initial scroll settle.

    // Focus the first card — click is the most reliable seed under Silk; D-pad
    // focus handoff from dock is brittle and not what this test measures.
    const firstCard = perfPage
      .locator(
        route === "movies"
          ? '[data-page="movies"] button, [data-page="movies"] a'
          : '[data-page="series"] [data-testid="series-card"], [data-page="series"] button[aria-label]:not([aria-pressed]):not([aria-checked]):not([data-resume-hero-button])',
      )
      .first();
    await firstCard.waitFor({ state: "visible", timeout: 60_000 });
    await firstCard.focus();

    // Clear sampler so we only capture during-scroll frames.
    await perfPage.evaluate(() => {
      (window as unknown as { __svFrames: number[] }).__svFrames = [];
    });

    const pressStart = await perfPage.evaluate(() => performance.now());
    for (let i = 0; i < PRESSES; i += 1) {
      await perfPage.keyboard.press("ArrowDown");
      // Tiny wait so we don't coalesce all presses into one frame — mirrors a
      // real user's key repeat (~100ms).
      await perfPage.waitForTimeout(80);
    }
    const pressEnd = await perfPage.evaluate(() => performance.now());

    const metrics: PerfMetrics = await harvest();
    const frames = metrics.frames;
    const total = frames.length;
    const dropped = frames.filter((f) => f > 32).length;
    const droppedPct = total > 0 ? (dropped / total) * 100 : 0;
    const p50 = percentile(frames, 50);
    const p95 = percentile(frames, 95);
    const p99 = percentile(frames, 99);

    await testInfo.attach(`perf-grid-scroll-${route}.json`, {
      body: JSON.stringify(
        {
          cpuRate,
          route,
          presses: PRESSES,
          wallDurationMs: pressEnd - pressStart,
          totalFramesSampled: total,
          droppedFrames: dropped,
          droppedFramePct: droppedPct,
          frameDeltaMs: { p50, p95, p99 },
          longTasksTotal: metrics.longTasks.length,
          vitals: metrics.vitals,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });

    expect(total).toBeGreaterThan(0);
  });
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx] ?? 0;
}
