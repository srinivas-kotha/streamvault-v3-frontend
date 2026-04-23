import type { Page } from "@playwright/test";

/**
 * Pre-seed a fake access token in localStorage before any page script runs,
 * and stub `/api/auth/refresh` to succeed. App.tsx's boot gate always fires
 * `apiClient.tryBootRefresh()` before rendering — without the stub the fake
 * session would get wiped on boot and LoginPage would render instead of the
 * expected app shell.
 *
 * Use this in every E2E spec that does NOT exercise the login flow itself
 * (routing, dock-nav, axe, silk-probe, smoke, etc.). The login spec
 * (`auth.spec.ts`) hits a real backend and intentionally does not seed.
 */
export async function seedFakeAuth(page: Page): Promise<void> {
  // 1. Stub the boot refresh so the auth gate treats the fake session as
  //    valid. Both paths (same-origin and dev localhost:3001) return 200.
  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Tokens refreshed" }),
    });
  });

  // 2. Seed the sentinel in localStorage (moved from sessionStorage in
  //    Phase 1 of the UX rebuild — see docs/ux/00-ia-navigation.md §7).
  await page.addInitScript(() => {
    localStorage.setItem("sv_access_token", "e2e-fake-access-token");
    localStorage.setItem("sv_refresh_token", "e2e-fake-refresh-token");
  });
}
