/**
 * Global setup for live-verification-r2.
 * Runs ONCE before the test suite, performs a single login,
 * and saves the session state to disk so all 7 tests can
 * restore it without hitting /api/auth/login again.
 */
import { chromium } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SESSION_PATH = path.resolve(
  __dirname,
  "live-verification-r2.spec.ts-snapshots",
  "session-state.json"
);

export default async function globalSetup() {
  const username = process.env["STREAMVAULT_E2E_USER"] ?? "admin";
  const password = process.env["STREAMVAULT_E2E_PASS"] ?? "Testing@1234";
  const baseURL =
    process.env["STREAMVAULT_PROD_URL"] ??
    "https://streamvault.srinivaskotha.uk";

  // Ensure snapshot dir exists
  const dir = path.dirname(SESSION_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // If session file already exists and is fresh (< 10 min old), reuse it
  if (fs.existsSync(SESSION_PATH)) {
    const age = Date.now() - fs.statSync(SESSION_PATH).mtimeMs;
    if (age < 10 * 60 * 1000) {
      console.log(
        `[globalSetup] Reusing cached session (age=${Math.round(age / 1000)}s)`
      );
      return;
    }
  }

  console.log(`[globalSetup] Logging in as "${username}" to ${baseURL} …`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    baseURL,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await ctx.newPage();

  await page.goto("/");
  await page.waitForSelector("input#username", { timeout: 20_000 });
  await page.fill("input#username", username);
  await page.fill("input#password", password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('nav[aria-label="Main navigation"]', {
    timeout: 20_000,
  });
  await page.waitForTimeout(1000);

  await ctx.storageState({ path: SESSION_PATH });
  console.log(`[globalSetup] Session saved → ${SESSION_PATH}`);
  await browser.close();
}
