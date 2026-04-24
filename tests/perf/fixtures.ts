/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture API uses
   `use()` which trips the React hook rule; these are not React hooks. */
import { test as base, type Page, type CDPSession } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

/**
 * Fire TV perf fixture.
 *
 * Applies CDP CPU + network throttling and Silk UA BEFORE the first navigation,
 * then injects `web-vitals`, a longtask observer, and a rAF frame sampler via
 * `page.addInitScript` so they attach before any script runs.
 *
 * Footguns handled here (rather than in each spec):
 *  - `Performance.enable` must precede any `getMetrics` (else empty result).
 *  - Throttling must be set BEFORE `page.goto` (cold-load uncounted otherwise).
 *  - `cdp.detach()` in afterEach to avoid session leak across tests.
 *  - `performance.measureUserAgentSpecificMemory()` requires crossOriginIsolated;
 *    we expose `sampleHeap()` which tries the precise API then falls back to
 *    `performance.memory.usedJSHeapSize` (Chrome dev flag, included in launch args).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_VITALS_IIFE = readFileSync(
  resolve(__dirname, "../../node_modules/web-vitals/dist/web-vitals.iife.js"),
  "utf8",
);

// Silk UA taken from a real Fire TV Stick 4K (AFTKA build). UA alone is enough
// to trip the data-tv="true" branch in src/main.tsx.
const SILK_UA =
  "Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7288.4122N) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Silk/119.3.3 like Chrome/119.0.6045.193 Safari/537.36";

// Slow 4G preset matches household Wi-Fi TV after router degrades. Keeps the
// bottleneck CPU-bound (where the lag lives); Regular 3G would under-throttle
// network waits that mask CPU signals.
const SLOW_4G = {
  offline: false,
  latency: 750, // ms
  downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps → bytes/s
  uploadThroughput: (0.75 * 1024 * 1024) / 8,
};

export interface PerfMetrics {
  vitals: Array<{ name: string; value: number; id: string; rating?: string }>;
  longTasks: Array<{ name: string; dur: number; start: number }>;
  frames: number[];
  heapStart?: number;
  heapEnd?: number;
  measurementMethod: "precise" | "fallback" | "unavailable";
}

export interface PerfFixture {
  perfPage: Page;
  cpuRate: number;
  /** Wait for the first route's sentinel, then return timing anchor. */
  routeReady: (sentinel: string) => Promise<void>;
  /** Read accumulated metrics and reset frame / long-task buffers. */
  harvest: () => Promise<PerfMetrics>;
  /** Wall-clock transition measurement; pass the destination `data-page` sentinel. */
  transition: (
    action: () => Promise<void>,
    dest: { urlPattern: RegExp; sentinel: string },
  ) => Promise<{
    transitionMs: number;
    longTasksDuringTransition: Array<{ dur: number; start: number }>;
  }>;
}

export const test = base.extend<PerfFixture>({
  cpuRate: [
    // Default 6× (Fire TV Stick Lite class). Project metadata overrides.
    // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature.
    async ({}, use, testInfo) => {
      const metaRate = (testInfo.project.metadata as { cpuRate?: number })
        ?.cpuRate;
      const envRate = process.env["PERF_CPU_RATE"]
        ? Number(process.env["PERF_CPU_RATE"])
        : undefined;
      const baseline = process.env["PERF_BASELINE"] === "1";
      const rate = baseline ? 1 : (envRate ?? metaRate ?? 6);
      await use(rate);
    },
    { option: true },
  ],

  perfPage: async ({ page, cpuRate }, use) => {
    const cdp: CDPSession = await page.context().newCDPSession(page);

    // Enable domains BEFORE any navigation / metric read.
    await cdp.send("Network.enable");
    await cdp.send("Performance.enable");

    // UA override must be set before addInitScript so the app's UA sniff in
    // src/main.tsx sees Silk on the very first evaluation.
    await cdp.send("Emulation.setUserAgentOverride", { userAgent: SILK_UA });

    // Stub /api/auth/refresh to return 200 without hitting the backend.
    // Why: the real backend ROTATES the refresh token on every call (security
    // best practice). Global-setup logs in and saves one set of cookies; each
    // spec loads those cookies into a fresh context and the app's boot-refresh
    // call would rotate the token for ITS context only — invalidating the
    // shared refresh_token that every other test relies on. Stubbing keeps the
    // app in the "authenticated" code path while preserving the valid
    // access_token cookie for real API reads (catalog, history, etc.). Same
    // pattern as tests/e2e/helpers.ts:seedFakeAuth.
    await page.route("**/api/auth/refresh", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Tokens refreshed" }),
      });
    });

    // Throttling AFTER route setup. Baseline mode (rate 1) intentionally
    // skips network emulation — we want a clean upper bound.
    if (cpuRate > 1) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
      await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    }

    // Init scripts run before any page script on EVERY navigation. Single
    // combined script avoids three addInitScript calls racing each other.
    await page.addInitScript(
      ({ webVitalsSrc }: { webVitalsSrc: string }) => {
        // --- web-vitals (IIFE exposes `webVitals` global) --------------------
        const g = window as unknown as {
          __svVitals: Array<{
            name: string;
            value: number;
            id: string;
            rating?: string;
          }>;
          __svLong: Array<{ name: string; dur: number; start: number }>;
          __svFrames: number[];
          webVitals?: {
            onLCP: (cb: (m: unknown) => void) => void;
            onCLS: (cb: (m: unknown) => void) => void;
            onINP: (cb: (m: unknown) => void) => void;
            onFCP: (cb: (m: unknown) => void) => void;
            onTTFB: (cb: (m: unknown) => void) => void;
          };
        };
        g.__svVitals = [];
        g.__svLong = [];
        g.__svFrames = [];

        try {
          new Function(webVitalsSrc)();
        } catch (e) {
          console.error("[perf] web-vitals inject failed", e);
        }
        const wv = g.webVitals;
        if (wv) {
          const push = (m: unknown) => {
            const mm = m as {
              name: string;
              value: number;
              id: string;
              rating?: string;
            };
            g.__svVitals.push({
              name: mm.name,
              value: mm.value,
              id: mm.id,
              rating: mm.rating,
            });
          };
          wv.onLCP(push);
          wv.onCLS(push);
          wv.onINP(push);
          wv.onFCP(push);
          wv.onTTFB(push);
        }

        // --- Long tasks ------------------------------------------------------
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              g.__svLong.push({
                name: e.name,
                dur: e.duration,
                start: e.startTime,
              });
            }
          }).observe({ entryTypes: ["longtask"] });
        } catch {
          // longtask unsupported in some browsers; tolerated.
        }

        // --- Frame sampler (rAF delta in ms) ---------------------------------
        let last = performance.now();
        const tick = (now: number) => {
          g.__svFrames.push(now - last);
          last = now;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { webVitalsSrc: WEB_VITALS_IIFE },
    );

    // Stash cpuRate + network settings in the page so the reporter can annotate.
    await page.addInitScript((meta: { cpuRate: number }) => {
      (window as unknown as { __svPerfMeta: unknown }).__svPerfMeta = meta;
    }, { cpuRate });

    await use(page);

    await cdp.detach().catch(() => {
      /* already detached on page close */
    });
  },

  routeReady: async ({ page }, use) => {
    // Wait on the passed sentinel — usually `[data-page="..."]` (emitted by
    // every route). Keeps the perf suite decoupled from app-side edits.
    const routeReady = async (sentinel: string) => {
      await page.waitForSelector(sentinel, { timeout: 30_000 });
    };
    await use(routeReady);
  },

  harvest: async ({ page }, use) => {
    const harvest = async (): Promise<PerfMetrics> => {
      const snapshot = await page.evaluate(() => {
        const g = window as unknown as {
          __svVitals: PerfMetrics["vitals"];
          __svLong: PerfMetrics["longTasks"];
          __svFrames: number[];
        };
        const out = {
          vitals: [...g.__svVitals],
          longTasks: [...g.__svLong],
          frames: [...g.__svFrames],
        };
        // Reset frame buffer (but KEEP vitals + longTasks — they accumulate).
        g.__svFrames = [];
        return out;
      });

      // Heap: try precise API, fall back to performance.memory (gated by
      // --enable-precise-memory-info which is set in launchOptions).
      const heap = await page.evaluate(async () => {
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

      return {
        ...snapshot,
        heapEnd: heap.bytes,
        measurementMethod: heap.method,
      };
    };
    await use(harvest);
  },

  transition: async ({ page }, use) => {
    const transition = async (
      action: () => Promise<void>,
      dest: { urlPattern: RegExp; sentinel: string },
    ) => {
      // Use Date.now() — wall-clock, immune to document-origin resets. When
      // the action falls back to a hard goto (SPA nav failed under throttle),
      // the destination document has a NEW `performance.timeOrigin` and
      // performance.now() resets, producing negative deltas. Date.now() is
      // monotonic across full navigations.
      const t0 = await page.evaluate(() => Date.now());
      const longBefore = await page.evaluate(() => {
        const g = window as unknown as { __svLong: Array<{ start: number }> };
        return g.__svLong.length;
      });
      await action();
      await page.waitForURL(dest.urlPattern, { timeout: 30_000 });
      await page.waitForSelector(dest.sentinel, { timeout: 30_000 });
      const t1 = await page.evaluate(() => Date.now());
      const longDuring = await page.evaluate((before) => {
        const g = window as unknown as {
          __svLong: Array<{ dur: number; start: number }>;
        };
        return g.__svLong
          .slice(before)
          .map((l) => ({ dur: l.dur, start: l.start }));
      }, longBefore);
      return { transitionMs: t1 - t0, longTasksDuringTransition: longDuring };
    };
    await use(transition);
  },
});

export { expect } from "@playwright/test";
