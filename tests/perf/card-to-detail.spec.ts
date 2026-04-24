import { test, expect } from "./fixtures";

/**
 * Card → detail: from /series list, open a series card and measure the cost
 * of mounting SeriesDetailRoute (1,421 lines, known hotspot — see plan §Known
 * hotspots item 1).
 *
 * Movies open a detail SHEET (MovieDetailSheet) not a route, so the card-to-
 * detail navigation test uses Series where a real route transition happens.
 */

test("series card → /series/:id detail route under throttle", async ({
  perfPage,
  routeReady,
  transition,
  harvest,
  cpuRate,
}, testInfo) => {
  // Auth pre-seeded via global-setup + storageState.
  await perfPage.goto("/series");
  await routeReady('[data-page="series"]');
  // Let virtuoso (or whatever list) paint and web-vitals settle.
  await perfPage.waitForTimeout(1500);

  // First Series card. Cards are anchors / buttons rendering each series.
  // Use `[data-testid="series-card"]` which is stable across the SeriesCard component
  // refactors we've been through.
  const firstCard = perfPage
    .locator('[data-testid="series-card"]')
    .or(
      perfPage.locator(
        '[data-page="series"] button[aria-label]:not([aria-pressed]):not([aria-checked]):not([data-resume-hero-button])',
      ),
    )
    .first();
  await firstCard.waitFor({ state: "visible", timeout: 60_000 });

  const heapBefore = await readHeap(perfPage);

  const { transitionMs, longTasksDuringTransition } = await transition(
    async () => {
      await firstCard.click({ timeout: 10_000 });
    },
    {
      urlPattern: /\/series\/[^/]+/,
      sentinel: '[data-page="series-detail"]',
    },
  );

  // Stabilize: a post-paint settle so the heap reading captures the committed
  // detail route, not a transient intermediate state.
  await perfPage.waitForTimeout(1000);
  const heapAfter = await readHeap(perfPage);
  const metrics = await harvest();

  await testInfo.attach("perf-card-to-detail.json", {
    body: JSON.stringify(
      {
        cpuRate,
        transitionMs,
        longTasksDuringTransition,
        heapBeforeBytes: heapBefore.bytes,
        heapAfterBytes: heapAfter.bytes,
        heapDeltaBytes: heapAfter.bytes - heapBefore.bytes,
        measurementMethod: heapAfter.method,
        vitals: metrics.vitals,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });

  expect(transitionMs).toBeGreaterThan(0);
});

async function readHeap(
  page: import("@playwright/test").Page,
): Promise<{ bytes: number; method: "precise" | "fallback" | "unavailable" }> {
  return await page.evaluate(async () => {
    try {
      const api = (
        performance as unknown as {
          measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
        }
      ).measureUserAgentSpecificMemory;
      if (api) {
        const r = await api.call(performance);
        return { bytes: r.bytes, method: "precise" as const };
      }
    } catch {
      /* fallback */
    }
    const pm = (performance as unknown as { memory?: { usedJSHeapSize: number } })
      .memory;
    if (pm) return { bytes: pm.usedJSHeapSize, method: "fallback" as const };
    return { bytes: 0, method: "unavailable" as const };
  });
}
