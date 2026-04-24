import { test, expect } from "./fixtures";

/**
 * Detail → Back: press the browser Back key from /series/:id and measure the
 * cost of tearing down SeriesDetailRoute + restoring the /series list focus.
 *
 * Exercises:
 *  - React Router pop transition
 *  - backStack.ts focus restoration (src/nav/backStack.ts)
 *  - focus-recovery keyup handler (src/App.tsx:267-308, suspected hotspot)
 */

test("series detail → Back → /series list under throttle", async ({
  perfPage,
  routeReady,
  transition,
  harvest,
  cpuRate,
}, testInfo) => {
  // Auth pre-seeded via global-setup + storageState.
  await perfPage.goto("/series");
  await routeReady('[data-page="series"]');
  await perfPage.waitForTimeout(1500);

  // Enter a series detail first.
  const firstCard = perfPage
    .locator('[data-testid="series-card"]')
    .or(
      perfPage.locator(
        '[data-page="series"] button[aria-label]:not([aria-pressed]):not([aria-checked]):not([data-resume-hero-button])',
      ),
    )
    .first();
  await firstCard.waitFor({ state: "visible", timeout: 60_000 });
  await firstCard.click({ timeout: 10_000 });
  await perfPage.waitForURL(/\/series\/[^/]+/);
  await routeReady('[data-page="series-detail"]');
  await perfPage.waitForTimeout(1000);

  // Measure the Back transition: hardware Back (Escape on Fire TV) maps to
  // history.back() via App.tsx handleEscape. We simulate via Escape key —
  // same codepath as a Fire TV remote Back press.
  const { transitionMs, longTasksDuringTransition } = await transition(
    async () => {
      await perfPage.keyboard.press("Escape");
    },
    { urlPattern: /\/series$/, sentinel: '[data-page="series"]' },
  );

  // Additional settle to capture any post-paint focus restore long tasks.
  await perfPage.waitForTimeout(500);
  const metrics = await harvest();

  await testInfo.attach("perf-back-navigation.json", {
    body: JSON.stringify(
      {
        cpuRate,
        transitionMs,
        longTasksDuringTransition,
        vitals: metrics.vitals,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });

  expect(transitionMs).toBeGreaterThan(0);
});
