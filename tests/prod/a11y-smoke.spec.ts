/**
 * a11y-smoke.spec.ts — Accessibility audit via axe-core on every route.
 *
 * Zero serious or critical violations allowed.
 * Warnings (moderate / minor) are permitted.
 *
 * Requires: STREAMVAULT_E2E_USER / STREAMVAULT_E2E_PASS
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginViaUI } from "./helpers";

const ROUTES: Array<{ name: string; path: string; dataPage: string }> = [
  { name: "Live",     path: "/live",     dataPage: "live" },
  { name: "Movies",  path: "/movies",   dataPage: "movies" },
  { name: "Series",  path: "/series",   dataPage: "series" },
  { name: "Search",  path: "/search",   dataPage: "search" },
  { name: "Settings",path: "/settings", dataPage: "settings" },
];

test.describe("Accessibility smoke — production", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  for (const route of ROUTES) {
    test(`${route.name} has zero serious/critical axe violations`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await page.waitForSelector(`[data-page="${route.dataPage}"]`, {
        timeout: 15_000,
      });
      // Let data load a beat before auditing
      await page.waitForTimeout(1_000);

      const results = await new AxeBuilder({ page })
        // Exclude dynamic third-party content (e.g. video player)
        .exclude("video")
        // Focus on serious/critical violations only
        .analyze();

      const seriousOrCritical = results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      );

      if (seriousOrCritical.length > 0) {
        const detail = seriousOrCritical
          .map(
            (v) =>
              `[${v.impact}] ${v.id}: ${v.description}\n  nodes: ${v.nodes.map((n) => n.target.join(",")).join(" | ")}`,
          )
          .join("\n\n");
        expect.soft(seriousOrCritical.length, `Axe violations on ${route.name}:\n${detail}`).toBe(0);
      }

      // Hard assertion after soft so the test status reflects reality
      expect(seriousOrCritical.length).toBe(0);
    });
  }
});
