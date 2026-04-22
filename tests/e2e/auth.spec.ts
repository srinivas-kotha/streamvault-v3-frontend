import { test, expect } from "@playwright/test";

/**
 * Auth E2E (Task 3.3 / Phase 4 D5).
 *
 * These tests require:
 *  - backend running on localhost:3001 (streamvault-backend), AND
 *  - E2E_USER + E2E_PASS env vars pointing at a seeded `sv_e2e_test`
 *    account (NOT the rotated prod admin password).
 *
 * Credentials are stored in GitHub Actions repo secrets (E2E_USER, E2E_PASS)
 * and injected into the CI Playwright step. For local runs, set them in
 * `.env.local` (see `.env.example`). Missing vars → the suite fails loudly
 * at runtime, which is the intended behavior after the D5 un-defer (we no
 * longer silently skip).
 */
const E2E_USER = process.env["E2E_USER"];
const E2E_PASS = process.env["E2E_PASS"];

test.describe("Auth E2E", () => {
  test("login with valid credentials stores token and shows app", async ({
    page,
  }) => {
    await page.goto("/");
    await page.fill("input#username", E2E_USER!);
    await page.fill("input#password", E2E_PASS!);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/live/, { timeout: 5000 });
    const token = await page.evaluate(() =>
      sessionStorage.getItem("sv_access_token"),
    );
    expect(token).toBeTruthy();
  });

  test("login with wrong password shows error alert", async ({ page }) => {
    await page.goto("/");
    await page.fill("input#username", E2E_USER!);
    await page.fill("input#password", "definitely-wrong-password-xyz");
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toContainText("Invalid");
  });
});
