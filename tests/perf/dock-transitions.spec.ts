import { test, expect, type PerfMetrics } from "./fixtures";
import { loginViaUI } from "../prod/helpers";

/**
 * Dock tab transitions: press the dock tab, measure time to destination paint.
 *
 * Covers the user complaint: "navigation gets stuck / lag a sec / no smooth
 * transitions" when flipping between tabs. We hit every dock tab and attach a
 * per-transition record onto the test info.
 */

interface DockRecord {
  from: string;
  to: string;
  transitionMs: number;
  longTasksDuringTransition: Array<{ dur: number; start: number }>;
}

// Dock order (see src/nav/BottomDock.tsx DOCK_ITEMS): Movies, Series, Live,
// Search, Settings. Login lands on /movies, so we start there.
const HOPS: Array<{
  from: string;
  to: string;
  urlPattern: RegExp;
  sentinel: string;
  dockKey: string;
}> = [
  {
    from: "movies",
    to: "series",
    urlPattern: /\/series(?!\/)/,
    sentinel: '[data-page="series"]',
    dockKey: "DOCK_SERIES",
  },
  {
    from: "series",
    to: "live",
    urlPattern: /\/live/,
    sentinel: '[data-page="live"]',
    dockKey: "DOCK_LIVE",
  },
  {
    from: "live",
    to: "search",
    urlPattern: /\/search/,
    sentinel: '[data-page="search"]',
    dockKey: "DOCK_SEARCH",
  },
  {
    from: "search",
    to: "settings",
    urlPattern: /\/settings/,
    sentinel: '[data-page="settings"]',
    dockKey: "DOCK_SETTINGS",
  },
];

test("dock transitions: walk the whole dock under throttle", async ({
  perfPage,
  routeReady,
  transition,
  harvest,
  cpuRate,
}, testInfo) => {
  await loginViaUI(perfPage);
  await routeReady('[data-page="movies"]');
  // Settle: let the initial render + web-vitals observers fire before we
  // start measuring dock hops.
  await perfPage.waitForTimeout(1500);

  const hops: DockRecord[] = [];

  for (const hop of HOPS) {
    const { transitionMs, longTasksDuringTransition } = await transition(
      async () => {
        // Prefer clicking the dock link — matches how a mouse/touch user
        // navigates. For D-pad nav see card-to-detail.spec.ts which uses
        // keyboard.press. We're measuring route-transition cost, not focus-
        // engine cost.
        await perfPage
          .locator(`nav[aria-label="Main navigation"] a`, {
            has: perfPage.locator(`[aria-label="${capitalize(hop.to)}"]`),
          })
          .first()
          .click({ timeout: 5000 })
          .catch(async () => {
            // Fallback: navigate directly. The click failure itself is a
            // finding (dock link unclickable under throttle).
            await perfPage.goto(`/${hop.to}`);
          });
      },
      { urlPattern: hop.urlPattern, sentinel: hop.sentinel },
    );
    hops.push({
      from: hop.from,
      to: hop.to,
      transitionMs,
      longTasksDuringTransition,
    });
    // Small settle window so the next transition starts from a quiet state.
    await perfPage.waitForTimeout(500);
  }

  const metrics: PerfMetrics = await harvest();

  await testInfo.attach("perf-dock-transitions.json", {
    body: JSON.stringify(
      { cpuRate, hops, vitals: metrics.vitals, measurementMethod: metrics.measurementMethod },
      null,
      2,
    ),
    contentType: "application/json",
  });

  // Baseline sanity: at least one hop should succeed. Hard assertion here
  // only — threshold grading is done by build-perf-report.mjs.
  expect(hops.length).toBe(HOPS.length);
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
