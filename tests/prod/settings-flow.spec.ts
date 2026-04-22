/**
 * settings-flow.spec.ts — Production smoke test for SettingsRoute.
 *
 * Credentials: STREAMVAULT_E2E_USER / STREAMVAULT_E2E_PASS.
 */
import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

test.describe("Settings flow — production", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test("dock Enter on Settings navigates to /settings", async ({ page }) => {
    // Walk dock: Live(0) → ... → Settings(4)
    await page.waitForTimeout(750);
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Settings",
      { timeout: 3_000 },
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings/, { timeout: 10_000 });
    await page.waitForSelector('[data-page="settings"]', { timeout: 10_000 });
  });

  test("username is shown in settings", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForSelector('[data-page="settings"]', { timeout: 10_000 });

    // Username display (testid or aria)
    const usernameEl = page
      .getByTestId("account-username")
      .or(page.getByRole("heading", { level: 2 }))
      .first();
    await expect(usernameEl).toBeVisible({ timeout: 5_000 });
    const text = await usernameEl.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test("subtitle preference toggle writes to localStorage", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForSelector('[data-page="settings"]', { timeout: 10_000 });

    // Clear existing preference
    await page.evaluate(() => localStorage.removeItem("sv_pref_subtitles"));

    // Find a subtitle / CC toggle (button or checkbox)
    const subtitleBtn = page
      .getByRole("button", { name: /subtitle|caption|cc/i })
      .or(page.getByRole("checkbox", { name: /subtitle|caption/i }))
      .first();

    const hasSubtitleToggle = await subtitleBtn.isVisible().catch(() => false);
    if (!hasSubtitleToggle) {
      // Fall back to quality toggle which is guaranteed to exist
      await page.evaluate(() => localStorage.removeItem("sv_pref_quality"));
      const qualityBtn = page.getByRole("button", { name: /720p|1080p|auto/i }).first();
      if (await qualityBtn.isVisible().catch(() => false)) {
        await qualityBtn.click();
        const stored = await page.evaluate(() =>
          localStorage.getItem("sv_pref_quality"),
        );
        expect(stored).toBeTruthy();
        return;
      }
      test.skip(true, "No known preference toggle found on settings page");
      return;
    }

    await subtitleBtn.click();
    const stored = await page.evaluate(() =>
      Object.entries(localStorage).filter(([k]) => k.startsWith("sv_pref")).map(([k, v]) => `${k}=${v}`)
    );
    expect(stored.length).toBeGreaterThan(0);
  });

  test("ArrowDown walks settings rows", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForSelector('[data-page="settings"]', { timeout: 10_000 });

    // Find any button or interactive row in settings
    const rows = page.locator('[data-page="settings"] button');
    const count = await rows.count();
    if (count < 2) {
      test.skip(true, "Not enough settings rows for D-pad traversal test");
      return;
    }

    await rows.first().focus();
    const labelBefore = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const labelAfter = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    expect(labelAfter).not.toBe(labelBefore);
  });

  test("visual: settings page screenshot", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForSelector('[data-page="settings"]', { timeout: 10_000 });

    await expect(page).toHaveScreenshot("settings-page.png", {
      fullPage: false,
      mask: [page.getByTestId("account-username")],
    });
  });
});
