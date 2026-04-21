import type { Page } from "@playwright/test";

/**
 * Pre-seed a fake access token in sessionStorage before any page script runs,
 * so the root-level auth gate in App.tsx lets the app render instead of
 * showing LoginPage. Use this in every E2E spec that does NOT exercise the
 * login flow itself (routing, dock-nav, axe, silk-probe, smoke).
 */
export async function seedFakeAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem("sv_access_token", "e2e-fake-access-token");
    localStorage.setItem("sv_refresh_token", "e2e-fake-refresh-token");
  });
}
