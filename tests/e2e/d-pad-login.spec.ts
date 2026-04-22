import { test, expect } from "@playwright/test";

/**
 * LoginPage D-pad navigation E2E (2026-04-22 norigin retrofit).
 *
 * Proves that `Username → Password → Sign in` is reachable via ArrowDown on
 * a TV remote. Before this fix shipped, LoginPage had zero `useFocusable`
 * wiring — Fire TV remotes could not focus any field, and the entire app
 * was unreachable on the primary target device.
 *
 * No `seedFakeAuth` here: we WANT the login gate to render. No credentials
 * are submitted — that path is covered separately in `auth.spec.ts`.
 *
 * Unlike dock-nav.spec.ts, this test does not need the `__svSetFocus` dev
 * hook: LoginPage calls `setFocus("LOGIN_USERNAME")` in its mount effect,
 * so norigin's focus tree is primed automatically the moment the page
 * renders.
 */
test.describe("LoginPage D-pad navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for LoginPage mount + norigin initial setFocus to settle.
    await page.waitForSelector('input[id="username"]', { timeout: 2000 });
    await page.waitForTimeout(200);
  });

  test("mount focuses username field (norigin primed via setFocus)", async ({
    page,
  }) => {
    await page.waitForFunction(
      () => document.activeElement?.id === "username",
      { timeout: 2000 },
    );
    expect(
      await page.evaluate(() => document.activeElement?.id),
    ).toBe("username");
  });

  test("ArrowDown moves focus Username → Password → Sign in", async ({
    page,
  }) => {
    await page.waitForFunction(
      () => document.activeElement?.id === "username",
      { timeout: 2000 },
    );

    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      () => document.activeElement?.id === "password",
      { timeout: 2000 },
    );
    expect(
      await page.evaluate(() => document.activeElement?.id),
    ).toBe("password");

    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      () =>
        document.activeElement?.tagName === "BUTTON" &&
        /sign in/i.test(document.activeElement?.textContent ?? ""),
      { timeout: 2000 },
    );
    const submitFocused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: document.activeElement?.textContent,
    }));
    expect(submitFocused.tag).toBe("BUTTON");
    expect(submitFocused.text).toMatch(/sign in/i);
  });

  test("Enter on Sign in button fires a POST /api/auth/login (norigin Enter path)", async ({
    page,
  }) => {
    // Any response is fine — we only assert the submit wired through to a
    // real network request. Without this, norigin preventDefaults Enter
    // and nothing happens (the bug first caught by a real-browser smoke
    // test after PR #29 merged).
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      }),
    );

    await page.waitForFunction(
      () => document.activeElement?.id === "username",
      { timeout: 2000 },
    );
    await page.fill("#username", "admin");
    await page.fill("#password", "test-pw");

    // Re-prime focus — fill() moved DOM focus to #password but norigin's
    // lastFocused may be stale. Walk back from username via D-pad.
    await page.evaluate(() => {
      (document.getElementById("username") as HTMLInputElement).focus();
    });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      () => document.activeElement?.tagName === "BUTTON",
      { timeout: 2000 },
    );

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/api/auth/login"),
    );
    await page.keyboard.press("Enter");
    const req = await requestPromise;
    expect(req.method()).toBe("POST");
  });

  test("ArrowUp from submit walks back to password then username", async ({
    page,
  }) => {
    // Walk down first.
    await page.waitForFunction(
      () => document.activeElement?.id === "username",
      { timeout: 2000 },
    );
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      () => document.activeElement?.tagName === "BUTTON",
      { timeout: 2000 },
    );

    // Now walk up.
    await page.keyboard.press("ArrowUp");
    await page.waitForFunction(
      () => document.activeElement?.id === "password",
      { timeout: 2000 },
    );

    await page.keyboard.press("ArrowUp");
    await page.waitForFunction(
      () => document.activeElement?.id === "username",
      { timeout: 2000 },
    );
  });
});
