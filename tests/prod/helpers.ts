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

  // Post-login: dock should appear within 5s. If this times out, login
  // failed silently — check credentials or the /api/auth/login response.
  await page.waitForSelector('nav[aria-label="Main navigation"]', {
    timeout: 10_000,
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

/**
 * Dock labels in order (left-to-right), matching the DockNav aria-labels.
 */
export type DockLabel = "Live" | "Movies" | "Series" | "Search" | "Settings";

const DOCK_ORDER: DockLabel[] = [
  "Live",
  "Movies",
  "Series",
  "Search",
  "Settings",
];

/**
 * Navigate to a specific dock item via keyboard (ArrowLeft/Right + Enter).
 *
 * Starts from whatever dock item is currently active/focused and walks
 * left or right until the target is reached, then presses Enter.
 *
 * Preconditions:
 *   - loginViaUI() has been called and completed.
 *   - A dock item currently has focus (wait for the dock to prime first).
 */
export async function navigateViaDock(
  page: Page,
  target: DockLabel,
): Promise<void> {
  // Wait for the dock to be visible.
  await page.waitForSelector('nav[aria-label="Main navigation"]', {
    timeout: 5_000,
  });

  // Give norigin time to prime focus.
  await page.waitForTimeout(750);

  // Determine current dock position.
  let currentIndex = -1;
  for (let i = 0; i < DOCK_ORDER.length; i++) {
    const active = await activeLabel(page);
    if (active === DOCK_ORDER[i]) {
      currentIndex = i;
      break;
    }
  }

  // If we couldn't detect current focus, try pressing ArrowLeft until we
  // reach the leftmost item (Live) and start from there.
  if (currentIndex === -1) {
    for (let i = 0; i < DOCK_ORDER.length; i++) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(100);
    }
    currentIndex = 0;
  }

  const targetIndex = DOCK_ORDER.indexOf(target);
  if (targetIndex === -1) throw new Error(`Unknown dock label: ${target}`);

  const delta = targetIndex - currentIndex;
  const key = delta > 0 ? "ArrowRight" : "ArrowLeft";
  for (let i = 0; i < Math.abs(delta); i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }

  // Confirm we reached the right label before pressing Enter.
  await page.waitForFunction(
    (want) => document.activeElement?.getAttribute("aria-label") === want,
    target,
    { timeout: 3_000 },
  );
  await page.keyboard.press("Enter");
}

/**
 * Install a console.error listener and return an assertion function.
 *
 * Call BEFORE the action-under-test, then call the returned function to
 * assert no errors were emitted.
 *
 * Usage:
 *   const assertNoErrors = await assertNoConsoleErrors(page);
 *   // ... do stuff ...
 *   await assertNoErrors();
 */
export function assertNoConsoleErrors(page: Page): () => void {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  return () => {
    if (errors.length > 0) {
      throw new Error(
        `Unexpected console errors (${errors.length}):\n${errors.join("\n")}`,
      );
    }
  };
}

/**
 * Wait for a <video> element to be ready for playback (readyState >= 2).
 *
 * Polls every 500ms up to `timeoutMs`. Throws with a helpful diagnostic if
 * the stream never loads.
 *
 * Note: For live streams behind Xtream rate-limits, the caller should
 * intercept network errors and call test.skip() before calling this.
 */
export async function waitForPlayerReady(
  page: Page,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const readyState = await page
      .evaluate(() => {
        const v = document.querySelector("video");
        return v ? v.readyState : -1;
      })
      .catch(() => -1);

    // readyState 2 = HAVE_CURRENT_DATA, 3 = HAVE_FUTURE_DATA, 4 = HAVE_ENOUGH_DATA
    if (readyState >= 2) return;

    await page.waitForTimeout(500);
  }

  // Diagnostic on timeout.
  const diagnostic = await page.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return "No <video> element found in DOM";
    return [
      `readyState=${v.readyState}`,
      `networkState=${v.networkState}`,
      `error=${v.error?.code ?? "none"}`,
      `src="${v.currentSrc.slice(0, 100)}"`,
    ].join(", ");
  });

  throw new Error(
    `waitForPlayerReady: timed out after ${timeoutMs}ms. Diagnostic: ${diagnostic}`,
  );
}
