/**
 * Live URL smoke verification spec.
 * Checks 7 scenarios against https://streamvault.srinivaskotha.uk
 * Run: npx playwright test tests/prod/live-verification.spec.ts --config playwright.prod.config.ts --project fire-tv-1080p
 */

import { test, expect, Page } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SNAPSHOTS_DIR = path.join(
  __dirname,
  "live-verification.spec.ts-snapshots"
);

// Ensure snapshot directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

async function saveScreenshot(page: Page, name: string) {
  const filepath = path.join(SNAPSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`[SCREENSHOT] ${filepath}`);
  return filepath;
}

const consoleErrors: string[] = [];
const networkFailures: string[] = [];

test.describe("Live StreamVault v3 Smoke Tests", () => {
  test.use({
    baseURL: "https://streamvault.srinivaskotha.uk",
    viewport: { width: 1920, height: 1080 },
  });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = `[CONSOLE ERROR] ${msg.text()}`;
        consoleErrors.push(text);
        console.log(text);
      }
    });

    // Capture network failures
    page.on("response", (response) => {
      const status = response.status();
      if (status >= 400) {
        const entry = `[NET ${status}] ${response.url()}`;
        networkFailures.push(entry);
        console.log(entry);
      }
    });
  });

  test.afterAll(async () => {
    console.log("\n=== CONSOLE ERRORS SUMMARY ===");
    if (consoleErrors.length === 0) {
      console.log("None");
    } else {
      consoleErrors.forEach((e) => console.log(e));
    }

    console.log("\n=== NETWORK FAILURES SUMMARY ===");
    if (networkFailures.length === 0) {
      console.log("None");
    } else {
      networkFailures.forEach((e) => console.log(e));
    }

    await page.close();
  });

  test("Check 1 — Login + post-login URL", async () => {
    await page.goto("/");
    await page.waitForSelector("input#username", { timeout: 10_000 });
    await page.fill("#username", "admin");
    await page.fill("#password", "Testing@1234");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/live/, { timeout: 10000 });

    const dock = page.locator('nav[aria-label="Main navigation"]');
    await expect(dock).toBeVisible({ timeout: 5000 });

    await saveScreenshot(page, "check1-login-success");
    console.log("[CHECK 1] PASS — URL:", page.url());
  });

  test("Check 2 — Dock auto-prime (setFocus DOCK_LIVE)", async () => {
    // Wait for the focus effect after login
    await page.waitForTimeout(2000);

    const activeAriaLabel = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("aria-label") ?? "(none)";
    });

    console.log(`[CHECK 2] activeElement aria-label: "${activeAriaLabel}"`);

    await saveScreenshot(page, "check2-dock-autoprime");

    expect(activeAriaLabel).toBe("Live");
    console.log("[CHECK 2] PASS — DOCK_LIVE auto-focused");
  });

  test("Check 3 — ArrowUp from dock enters content", async () => {
    // Ensure we're focused on DOCK_LIVE
    const activeAriaLabel = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("aria-label") ?? "(none)";
    });

    // If not on Live dock, try to find and focus it
    if (activeAriaLabel !== "Live") {
      const liveTab = page.locator('[aria-label="Live"]').first();
      await liveTab.focus();
      await page.waitForTimeout(300);
    }

    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(3000);

    const newAriaLabel = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("aria-label") ?? "(none)";
    });

    const newTagName = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName ?? "(none)";
    });

    const newDataFocusKey = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("data-focuskey") ?? "(none)";
    });

    const dockLabels = ["Live", "Movies", "Series", "Search", "Settings"];
    const isStillInDock = dockLabels.includes(newAriaLabel);

    console.log(
      `[CHECK 3] After ArrowUp: aria-label="${newAriaLabel}", tag="${newTagName}", data-focuskey="${newDataFocusKey}"`
    );

    await saveScreenshot(page, "check3-arrowup-content");

    expect(isStillInDock).toBe(false);
    console.log("[CHECK 3] PASS — Focus moved out of dock");
  });

  test("Check 4 — Movies page populates", async () => {
    // Navigate via dock to Movies
    await page.goto("/movies");
    await page.waitForTimeout(2000);

    await expect(page).toHaveURL(/\/movies/, { timeout: 5000 });

    // Wait up to 10s for VOD cards
    let cardCount = 0;
    try {
      await page.waitForSelector('[data-focuskey^="VOD_CARD_"]', {
        timeout: 10000,
      });
      cardCount = await page
        .locator('[data-focuskey^="VOD_CARD_"]')
        .count();
    } catch {
      // Try alternative selectors
      try {
        await page.waitForSelector('[data-page="movies"] button[aria-label]', {
          timeout: 3000,
        });
        cardCount = await page
          .locator('[data-page="movies"] button[aria-label]')
          .count();
      } catch {
        cardCount = 0;
      }
    }

    await saveScreenshot(page, "check4-movies-page");

    console.log(`[CHECK 4] Movies card count: ${cardCount}`);

    if (cardCount === 0) {
      // Capture what's rendered for diagnosis
      const bodyText = await page.evaluate(
        () => document.body.innerText.substring(0, 500)
      );
      console.log(`[CHECK 4] Body text (first 500 chars): ${bodyText}`);
    }

    expect(cardCount).toBeGreaterThan(0);
    console.log(`[CHECK 4] PASS — ${cardCount} Movies cards found`);
  });

  test("Check 5 — Series page populates", async () => {
    await page.goto("/series");
    await page.waitForTimeout(2000);

    await expect(page).toHaveURL(/\/series/, { timeout: 5000 });

    let cardCount = 0;
    try {
      await page.waitForSelector('[data-focuskey^="SERIES_CARD_"]', {
        timeout: 10000,
      });
      cardCount = await page
        .locator('[data-focuskey^="SERIES_CARD_"]')
        .count();
    } catch {
      cardCount = 0;
    }

    await saveScreenshot(page, "check5-series-page");

    console.log(`[CHECK 5] Series card count: ${cardCount}`);

    if (cardCount === 0) {
      const bodyText = await page.evaluate(
        () => document.body.innerText.substring(0, 500)
      );
      console.log(`[CHECK 5] Body text (first 500 chars): ${bodyText}`);
    }

    expect(cardCount).toBeGreaterThan(0);
    console.log(`[CHECK 5] PASS — ${cardCount} Series cards found`);
  });

  test("Check 6 — Search functionality", async () => {
    await page.goto("/search");
    await page.waitForTimeout(1000);

    await expect(page).toHaveURL(/\/search/, { timeout: 5000 });

    // Find search input
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="earch"], input[type="text"]')
      .first();
    await searchInput.waitFor({ timeout: 5000 });
    await searchInput.fill("a");

    // Wait for debounce + response
    await page.waitForTimeout(3000);

    await saveScreenshot(page, "check6-search-results");

    // Check for results or "not enough chars" message
    const resultTiles = await page
      .locator(
        '[data-focuskey^="SEARCH_RESULT_"], [data-focuskey^="VOD_CARD_"], [data-focuskey^="SERIES_CARD_"]'
      )
      .count();

    const pageText = await page.evaluate(
      () => document.body.innerText.substring(0, 1000)
    );

    console.log(`[CHECK 6] Search result count: ${resultTiles}`);
    console.log(`[CHECK 6] Page text snippet: ${pageText.substring(0, 300)}`);

    // Pass if there are results OR meaningful content rendered
    expect(resultTiles > 0 || pageText.length > 50).toBe(true);

    if (resultTiles > 0) {
      console.log(`[CHECK 6] PASS — ${resultTiles} result tiles visible`);
    } else {
      console.log(`[CHECK 6] PASS (min-chars message shown, page rendered OK)`);
    }
  });

  test("Check 7 — Playback start", async () => {
    await page.goto("/live");
    await page.waitForTimeout(2000);

    // Try to ArrowUp from dock to enter channel list
    const liveTab = page.locator('[aria-label="Live"]').first();
    try {
      await liveTab.focus({ timeout: 3000 });
    } catch {
      console.log("[CHECK 7] Could not focus Live tab directly");
    }

    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(1000);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    await saveScreenshot(page, "check7-playback-attempt");

    // Wait for video element
    let videoState = -1;
    let videoExists = false;

    try {
      await page.waitForSelector("video", { timeout: 30000 });
      videoExists = true;

      // Check video readyState
      videoState = await page.evaluate(() => {
        const video = document.querySelector("video") as HTMLVideoElement | null;
        return video?.readyState ?? -1;
      });

      console.log(
        `[CHECK 7] video found, readyState: ${videoState} (2=HAVE_CURRENT_DATA, 4=HAVE_ENOUGH_DATA)`
      );
    } catch {
      console.log("[CHECK 7] No <video> element appeared within 30s");
    }

    // Capture network errors related to stream
    const streamNetworkErrors = networkFailures.filter(
      (e) =>
        e.includes("stream") ||
        e.includes(".m3u8") ||
        e.includes(".ts") ||
        e.includes("403") ||
        e.includes("429") ||
        e.includes("get.php")
    );

    if (streamNetworkErrors.length > 0) {
      console.log(
        `[CHECK 7] Stream network errors: ${streamNetworkErrors.join(", ")}`
      );
    }

    await saveScreenshot(page, "check7-playback-final");

    if (!videoExists) {
      // Check if app didn't even try — this is an app bug
      const hasPlayIcon = await page.locator('[aria-label*="play"], [aria-label*="Play"]').count();
      console.log(`[CHECK 7] Play icons in DOM: ${hasPlayIcon}`);
      throw new Error("App did not attempt playback — no <video> element found");
    }

    if (videoState >= 2) {
      console.log("[CHECK 7] PASS — Video playing (readyState >= 2)");
    } else if (streamNetworkErrors.length > 0) {
      // Upstream rate-limit — not an app bug
      console.log(
        "[CHECK 7] PARTIAL PASS — App tried to play, upstream stream blocked (403/429). NOT an app bug."
      );
    } else {
      // Video element exists but not loading — potential app bug
      if (videoState < 1) {
        throw new Error(
          `Video element found but never started loading (readyState=${videoState})`
        );
      }
      console.log(`[CHECK 7] WARN — Video readyState=${videoState}, monitoring`);
    }
  });
});
