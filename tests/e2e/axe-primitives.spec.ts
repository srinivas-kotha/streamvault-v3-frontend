/**
 * axe-primitives.spec.ts — WCAG contrast gate for Oxide primitives (Task 1.7)
 *
 * Navigates to the /test-primitives dev fixture and runs axe-core against
 * wcag2a, wcag2aa, wcag21aa rule sets. The only hard gate for Phase 1 is
 * zero color-contrast violations — all other violations are also asserted
 * to zero since the primitive set is small and fully controlled.
 *
 * This test must stay green on CI. Never downgrade to "warn" on contrast.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedFakeAuth } from "./helpers";

test.describe("Oxide primitives — WCAG a11y gate", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeAuth(page);
  });

  test("0 color-contrast violations on /test-primitives", async ({ page }) => {
    await page.goto("/test-primitives");

    // Wait for primitives to render (fonts + CSS vars resolve)
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v) => v.id === "color-contrast",
    );

    // Hard gate: zero color-contrast violations (Phase 1 DoD)
    expect(
      contrastViolations,
      `color-contrast violations found:\n${JSON.stringify(contrastViolations, null, 2)}`,
    ).toHaveLength(0);

    // Full gate: zero violations total (primitives are fully controlled)
    expect(
      results.violations,
      `axe violations found:\n${JSON.stringify(results.violations, null, 2)}`,
    ).toHaveLength(0);
  });
});
