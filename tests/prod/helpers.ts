import type { Page } from "@playwright/test";

/**
 * Log in through the real login form on the production site.
 *
 * We deliberately avoid sessionStorage / cookie injection tricks here — the
 * whole point of the prod suite is to exercise the *actual* login flow that
 * a user (or a Fire TV) goes through, including httpOnly cookie set-up,
 * CSRF handshake, and the post-auth focus handoff into AppShell.
 */
export async function loginViaUI(page: Page): Promise<void> {
  const username = process.env["STREAMVAULT_E2E_USER"];
  const password = process.env["STREAMVAULT_E2E_PASS"];
  if (!username || !password) {
    throw new Error(
      "Missing STREAMVAULT_E2E_USER / STREAMVAULT_E2E_PASS env vars. " +
        "Set them before running the prod Playwright suite.",
    );
  }

  await page.goto("/");
  // Wait for norigin to prime LOGIN_USERNAME focus.
  await page.waitForSelector("input#username", { timeout: 10_000 });
  await page.fill("input#username", username);
  await page.fill("input#password", password);
  await page.click('button[type="submit"]');

  // Post-login: dock should appear. Wait generously — the perf suite runs
  // with CDP 6× CPU throttling where the post-login render itself exceeds
  // 10s (actual measured signal, not flake). Normal smoke runs resolve in
  // <2s so the bump doesn't slow the happy path, only the tail.
  await page.waitForSelector('nav[aria-label="Main navigation"]', {
    timeout: 45_000,
  });
}

/**
 * Read the currently-focused element's aria-label (what norigin's focus
 * tree landed on, since we set shouldFocusDOMNode:true during init).
 */
export async function activeLabel(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null,
  );
}
