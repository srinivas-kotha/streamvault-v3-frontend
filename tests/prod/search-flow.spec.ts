/**
 * search-flow.spec.ts — Production smoke test for the search flow.
 *
 * Prerequisites:
 *   - PROD_URL env var set to the live URL (e.g. https://streamvault.srinivaskotha.uk)
 *   - PROD_USERNAME / PROD_PASSWORD env vars with valid credentials
 *
 * What this proves:
 *   - Login via real UI
 *   - Navigate to /search via dock
 *   - Type a real short query
 *   - At least one result renders (or empty/error state)
 *   - Visual screenshot saved as search-results.png
 *
 * Run with:
 *   PROD_URL=https://... PROD_USERNAME=... PROD_PASSWORD=... \
 *     npx playwright test tests/prod/search-flow.spec.ts --headed
 */
import { test, expect } from "@playwright/test";

const PROD_URL = process.env["PROD_URL"] ?? "http://localhost:5173";
const PROD_USERNAME = process.env["PROD_USERNAME"] ?? "";
const PROD_PASSWORD = process.env["PROD_PASSWORD"] ?? "";

test.describe("Search flow — production smoke", () => {
  test.skip(
    !PROD_USERNAME || !PROD_PASSWORD,
    "Skipped: set PROD_USERNAME + PROD_PASSWORD env vars to run prod tests",
  );

  test("login → navigate to search → type query → assert result or state + screenshot", async ({
    page,
  }) => {
    // 1. Load the app
    await page.goto(PROD_URL);
    await page.waitForSelector("form[aria-label='Login']", { timeout: 10000 });

    // 2. Login
    await page.getByLabel("Username").fill(PROD_USERNAME);
    await page.getByLabel("Password").fill(PROD_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for dock to appear (auth success)
    await page.waitForSelector("nav[aria-label='Main navigation']", {
      timeout: 10000,
    });

    // 3. Navigate to /search via dock
    const searchTab = page.getByRole("tab", { name: /search/i });
    await searchTab.click();
    await page.waitForURL(/\/search/, { timeout: 5000 });

    // 4. Type a short real query
    const input = page.getByRole("searchbox");
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.click();
    await input.fill("news");

    // 5. Wait for debounce + fetch (allow up to 6s for prod backend)
    const resultsOrError = await Promise.race([
      page
        .getByRole("list", { name: /results/i })
        .first()
        .waitFor({ state: "visible", timeout: 6000 })
        .then(() => "results"),
      page
        .getByRole("alert")
        .waitFor({ state: "visible", timeout: 6000 })
        .then(() => "error"),
      page
        .getByRole("status")
        .waitFor({ state: "visible", timeout: 6000 })
        .then(() => "empty"),
    ]).catch(() => "timeout");

    // 6. Visual screenshot
    await page.screenshot({ path: "search-results.png", fullPage: false });

    // Some deterministic terminal state must appear
    expect(["results", "error", "empty"]).toContain(resultsOrError);

    // If results — at least one card should be present
    if (resultsOrError === "results") {
      const cards = page.getByRole("list", { name: /results/i }).first();
      const cardCount = await cards.getByRole("listitem").count();
      expect(cardCount).toBeGreaterThan(0);
    }
  });
});
