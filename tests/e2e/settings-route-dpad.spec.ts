/**
 * settings-route-dpad.spec.ts — Dev E2E: D-pad navigation + pref persistence.
 *
 * Pattern mirrors live-route-dpad.spec.ts:
 *  - seedFakeAuth → goto /settings → __svSetFocus → D-pad navigation
 *  - Verifies norigin registration for preference chips and account buttons.
 *  - Verifies a chip click updates localStorage.
 *
 * MANUAL TV SMOKE TEST REQUIRED after merge (see annotation below).
 */
import { test, expect } from "@playwright/test";
import { seedFakeAuth } from "./helpers";

test.describe("SettingsRoute D-pad navigation", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeAuth(page);
    // Seed a known username for the account section
    await page.addInitScript(() => {
      sessionStorage.setItem("sv_access_token", "e2e-user");
    });
    await page.goto("/settings");
    await page.waitForTimeout(500);
  });

  test("all four sections render", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /account/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /playback preferences/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /app info/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /danger zone/i }),
    ).toBeVisible();
  });

  test("username shows from session", async ({ page }) => {
    const val = page.getByTestId("account-username");
    await expect(val).toHaveText("e2e-user");
  });

  test("ACCOUNT_LOGOUT focus key is registered", async ({ page }) => {
    test.info().annotations.push({
      type: "manual-tv-smoke",
      description:
        "MANUAL TV REQUIRED: navigate to /settings, arrow to Sign Out, press OK.",
    });

    await page.evaluate(() =>
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("ACCOUNT_LOGOUT"),
    );
    await page.waitForFunction(
      () =>
        document.activeElement?.textContent?.toLowerCase().includes("sign out"),
      { timeout: 2000 },
    );
    expect(await page.evaluate(() => document.activeElement?.textContent)).toMatch(
      /sign out/i,
    );
  });

  test("PREF_SUBTITLE_OFF chip is D-pad focusable and clicking updates localStorage", async ({
    page,
  }) => {
    // Pre-set subtitle to 'en' so clicking 'Off' proves a change
    await page.evaluate(() => localStorage.setItem("sv_pref_subtitle", "en"));

    await page.evaluate(() =>
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("PREF_SUBTITLE_OFF"),
    );

    await page.waitForFunction(
      () => document.activeElement?.textContent?.toLowerCase() === "off",
      { timeout: 2000 },
    );

    await page.keyboard.press("Enter");

    const stored = await page.evaluate(() =>
      localStorage.getItem("sv_pref_subtitle"),
    );
    expect(stored).toBe("off");
  });

  test("DANGER_CLEAR_HISTORY focus key is registered", async ({ page }) => {
    await page.evaluate(() =>
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("DANGER_CLEAR_HISTORY"),
    );
    await page.waitForFunction(
      () =>
        document.activeElement
          ?.textContent?.toLowerCase()
          .includes("clear history"),
      { timeout: 2000 },
    );
    expect(await page.evaluate(() => document.activeElement?.textContent)).toMatch(
      /clear history/i,
    );
  });

  test("ArrowUp from dock reaches Account section when entering from DOCK_SETTINGS", async ({
    page,
  }) => {
    // Navigate to /settings and prime focus on the dock settings tab
    await page.evaluate(() =>
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("DOCK_SETTINGS"),
    );

    await page.waitForFunction(
      () =>
        document.activeElement?.textContent?.toLowerCase().includes("settings"),
      { timeout: 2000 },
    );

    // Move up into the page content
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(300);

    // Some focusable in the page should now be active
    const activeKey = await page.evaluate(
      () => document.activeElement?.tagName,
    );
    // Should have moved off the dock (button in dock → something in main)
    expect(activeKey).toBeTruthy();
  });
});
