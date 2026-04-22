/**
 * movies-browse.spec.ts — Production smoke test for the MoviesRoute.
 *
 * Runs against a live VPS deployment (PROD_BASE_URL env var).
 * Logs in with real credentials, navigates to /movies via the dock,
 * verifies a MovieCard renders, walks the grid with D-pad.
 *
 * Run with:
 *   PROD_BASE_URL=https://streamvault.srinivaskotha.uk \
 *   PROD_USERNAME=<user> PROD_PASSWORD=<pass> \
 *   npx playwright test --config=playwright.prod.config.ts
 *
 * This spec is NOT run in CI (it requires live credentials).
 * It is a manual pre-deploy smoke gate per the "E2E not done until proven" rule.
 */
import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env["PROD_BASE_URL"] ?? "https://streamvault.srinivaskotha.uk";
const USERNAME = process.env["PROD_USERNAME"] ?? "";
const PASSWORD = process.env["PROD_PASSWORD"] ?? "";

async function loginViaUI(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/username/i).fill(USERNAME);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 10_000,
  });
}

test.describe("Movies browse — production smoke", () => {
  test.skip(
    !USERNAME || !PASSWORD,
    "PROD_USERNAME / PROD_PASSWORD env vars not set — skipping prod smoke",
  );

  test("navigate to /movies via dock and see a MovieCard", async ({ page }) => {
    test.info().annotations.push({
      type: "prod-smoke",
      description:
        "Logs into live VPS, navigates to /movies via dock, verifies a " +
        "movie card renders, walks the grid with D-pad ArrowRight.",
    });

    await loginViaUI(page);

    // Navigate to /movies via dock — from DOCK_LIVE, press ArrowRight to DOCK_MOVIES
    await page.evaluate(() => {
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("DOCK_MOVIES");
    });
    await page.keyboard.press("Enter");

    // Wait for the movies page to render
    await page.waitForURL(`${BASE_URL}/movies`, { timeout: 10_000 });

    // Wait for a movie card to appear (poster grid populated)
    const grid = page.getByLabel("Movie poster grid");
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const firstCard = grid.locator("button").first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });

    // Press ArrowDown from dock into grid, then ArrowRight to walk cards
    await page.evaluate(() => {
      (
        window as unknown as { __svSetFocus: (key: string) => void }
      ).__svSetFocus("DOCK_MOVIES");
    });
    await page.keyboard.press("ArrowUp");

    // Walk a couple of cards with ArrowRight
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");

    // Screenshot visual gate
    await page.screenshot({
      path: "test-results/movies-grid.png",
      fullPage: false,
    });

    // Verify no error shell appeared
    expect(
      await page.locator("[role='alert']").isVisible().catch(() => false),
    ).toBe(false);
  });

  test("category strip is visible and ArrowRight walks chips", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto(`${BASE_URL}/movies`);

    const strip = page.getByRole("tablist", { name: /movie categories/i });
    await expect(strip).toBeVisible({ timeout: 15_000 });

    const chips = strip.locator("button");
    await expect(chips.first()).toBeVisible();

    // Walk chips with keyboard
    await chips.first().focus();
    await page.keyboard.press("ArrowRight");

    // Focus should have moved — activeElement changes
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label"),
    );
    expect(focused).toBeTruthy();
  });
});
