/**
 * settings-flow.spec.ts — Live URL smoke test for the Settings page.
 *
 * Requires:
 *   PROD_URL      — e.g. https://streamvault.srinivaskotha.uk
 *   PROD_USERNAME — test account username
 *   PROD_PASSWORD — test account password
 *
 * Run with:
 *   PROD_URL=https://... PROD_USERNAME=... PROD_PASSWORD=... \
 *     npx playwright test tests/prod/settings-flow.spec.ts
 *
 * NOT included in the default CI testDir (./tests/e2e) — run manually or in a
 * dedicated prod-smoke job with the above env vars set.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env["PROD_URL"] ?? "http://localhost:5173";
const USERNAME = process.env["PROD_USERNAME"] ?? "";
const PASSWORD = process.env["PROD_PASSWORD"] ?? "";

test.describe("Settings flow — live URL", () => {
  test.skip(!USERNAME || !PASSWORD, "PROD_USERNAME / PROD_PASSWORD not set");

  test("login → navigate to /settings → username shown + pref toggle", async ({
    page,
  }) => {
    // 1. Login via UI
    await page.goto(`${BASE}/`);
    await page.waitForSelector("[data-page], input[type='text']", {
      timeout: 10000,
    });

    // Fill login form if shown (not already authed)
    const usernameInput = page.locator("input").first();
    if (await usernameInput.isVisible()) {
      await usernameInput.fill(USERNAME);
      const passwordInput = page.locator("input[type='password']").first();
      await passwordInput.fill(PASSWORD);
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/(live|movies|series|search|settings)/, {
        timeout: 10000,
      });
    }

    // 2. Navigate to /settings
    await page.goto(`${BASE}/settings`);
    await page.waitForSelector("[data-page='settings']", { timeout: 5000 });

    // 3. Verify username is shown
    const usernameEl = page.getByTestId("account-username");
    await expect(usernameEl).toBeVisible();
    const displayedUsername = await usernameEl.textContent();
    expect(displayedUsername?.trim().length).toBeGreaterThan(0);

    // 4. Toggle a preference
    await page.evaluate(() => localStorage.removeItem("sv_pref_quality"));

    const chip720 = page.getByRole("button", { name: /720p/i });
    await chip720.click();

    const stored = await page.evaluate(() =>
      localStorage.getItem("sv_pref_quality"),
    );
    expect(stored).toBe("720p");

    // 5. Visual screenshot
    await page.screenshot({ path: "test-results/settings-prod-snapshot.png" });
  });
});
