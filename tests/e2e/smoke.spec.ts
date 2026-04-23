import { test, expect } from "@playwright/test";

// Phase 0 smoke — just verifies the dev server serves the app.
// Expanded in Phase 3 (auth flows) and Phase 5 (player).
test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/StreamVault/);
});
