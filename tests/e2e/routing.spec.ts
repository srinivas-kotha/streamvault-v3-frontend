import { test, expect } from "@playwright/test";
import { seedFakeAuth } from "./helpers";

test.describe("Routing", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeAuth(page);
  });

  test("/ redirects to /live", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/live/);
  });
  test("/movies renders Movies shell", async ({ page }) => {
    await page.goto("/movies");
    await expect(page.locator('[data-page="movies"]')).toBeVisible();
  });
  test("/search renders Search shell", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator('[data-page="search"]')).toBeVisible();
  });
});
