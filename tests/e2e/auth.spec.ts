import { test, expect } from "@playwright/test";

/**
 * Auth E2E (Task 3.3).
 *
 * These tests require:
 *  - backend running on localhost:3001 (streamvault-backend), AND
 *  - SV_TEST_USER + SV_TEST_PASS env vars pointing at a seeded `sv_e2e_test`
 *    account (NOT the rotated prod admin password).
 *
 * FIX: E1 — fail-fast guard below ensures CI doesn't silently hit fallbacks.
 * Unset vars → whole auth suite is skipped with a clear reason (so missing
 * secrets in CI show up as "skipped" not "falsely-green").
 */
const SV_TEST_USER = process.env["SV_TEST_USER"];
const SV_TEST_PASS = process.env["SV_TEST_PASS"];

test.describe("Auth E2E", () => {
  test.skip(
    !SV_TEST_USER || !SV_TEST_PASS,
    "SV_TEST_USER / SV_TEST_PASS env vars not set — see .env.example. " +
      "Auth E2E requires a seeded sv_e2e_test account + backend at localhost:3001.",
  );

  test("login with valid credentials stores token and shows app", async ({
    page,
  }) => {
    await page.goto("/");
    await page.fill("input#username", SV_TEST_USER!);
    await page.fill("input#password", SV_TEST_PASS!);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/live/, { timeout: 5000 });
    const token = await page.evaluate(() =>
      sessionStorage.getItem("sv_access_token"),
    );
    expect(token).toBeTruthy();
  });

  test("login with wrong password shows error alert", async ({ page }) => {
    await page.goto("/");
    await page.fill("input#username", SV_TEST_USER!);
    await page.fill("input#password", "definitely-wrong-password-xyz");
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toContainText("Invalid");
  });
});
