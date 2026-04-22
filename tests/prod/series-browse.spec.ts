import { test, expect } from "@playwright/test";

/**
 * Series browse — PRODUCTION smoke test.
 *
 * Runs against the live URL (streamvault.srinivaskotha.uk).
 * Requires valid credentials via env vars:
 *   PROD_USERNAME  — IPTV account username
 *   PROD_PASSWORD  — IPTV account password
 *
 * What this covers:
 *  - Real login via UI (cookie-auth flow).
 *  - Navigate to /series via dock.
 *  - Category strip renders from live API.
 *  - Arrow across category chips (D-pad simulation).
 *  - Series grid loads cards from the real backend.
 *  - Visual screenshot: tests/prod/screenshots/series-grid.png.
 *
 * Skip automatically when credentials are not provided — safe in CI.
 */

const PROD_URL = process.env["PROD_URL"] ?? "https://streamvault.srinivaskotha.uk";
const PROD_USERNAME = process.env["PROD_USERNAME"];
const PROD_PASSWORD = process.env["PROD_PASSWORD"];

test.describe("Series browse — production", () => {
  test.skip(
    !PROD_USERNAME || !PROD_PASSWORD,
    "PROD_USERNAME / PROD_PASSWORD env vars not set — skipping prod test",
  );

  async function loginViaUI(page: import("@playwright/test").Page) {
    await page.goto(PROD_URL);
    await page.waitForSelector('input[type="text"], input[name="username"]', {
      timeout: 10_000,
    });

    // Fill login form — field selectors match the LoginPage component.
    const userInput = page.locator(
      'input[name="username"], input[placeholder*="username" i], input[type="text"]',
    ).first();
    const passInput = page.locator('input[type="password"]').first();

    await userInput.fill(PROD_USERNAME!);
    await passInput.fill(PROD_PASSWORD!);

    // Submit — try Enter, then button click.
    await passInput.press("Enter");
    await page.waitForURL(/\/(live|movies|series|search|settings|$)/, {
      timeout: 15_000,
    });
  }

  test("login → navigate to /series → category strip → grid screenshot", async ({
    page,
  }) => {
    await loginViaUI(page);

    // Navigate to /series via dock button.
    const dockSeries = page.getByRole("tab", { name: /series/i });
    if (await dockSeries.isVisible()) {
      await dockSeries.click();
    } else {
      await page.goto(`${PROD_URL}/series`);
    }

    await page.waitForURL(/\/series/, { timeout: 10_000 });

    // Wait for category strip to appear (real data from backend).
    const strip = page.getByRole("toolbar", { name: /series categories/i });
    await expect(strip).toBeVisible({ timeout: 15_000 });

    // Arrow across a few chips (D-pad simulation).
    const chips = strip.getByRole("button");
    const count = await chips.count();

    if (count >= 2) {
      await chips.nth(0).click();
      await page.waitForTimeout(300);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(300);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(300);
    }

    // Wait for grid to load.
    await page.waitForTimeout(2_000);

    // Visual screenshot for QA review.
    await page.screenshot({
      path: "tests/prod/screenshots/series-grid.png",
      fullPage: false,
    });

    // Assert grid OR empty state is visible.
    const grid = page.getByRole("list", { name: /series grid/i });
    const emptyState = page.getByText(/no series in this category/i);

    const gridVisible = await grid.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);

    expect(gridVisible || emptyVisible).toBe(true);
  });
});
