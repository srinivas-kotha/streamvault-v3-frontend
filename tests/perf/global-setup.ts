import { chromium, type FullConfig } from "@playwright/test";
import { loginViaUI } from "../prod/helpers";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Global setup: log in ONCE and save the auth state so every perf spec can
 * reuse it via `storageState`. Avoids the backend's login rate-limit of
 * 5 attempts per 15-minute window (see streamvault-backend
 * src/middleware/rateLimiter.ts) — otherwise a 10-spec run (2 projects × 5
 * specs) blows past the ceiling on the 6th test.
 *
 * Output path: perf-artifacts/auth.json. Written only in-process, wiped by
 * `run-perf-prod.mjs` at the start of each run alongside the rest of
 * perf-artifacts/ — no long-lived token on disk.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env["STREAMVAULT_PROD_URL"] ??
    config.projects[0]?.use.baseURL ??
    "https://streamvault.srinivaskotha.uk";
  const statePath = "perf-artifacts/auth.json";
  mkdirSync(dirname(statePath), { recursive: true });

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  console.log("[perf-setup] logging in once for the whole suite…");
  await loginViaUI(page);
  await context.storageState({ path: statePath });
  console.log(`[perf-setup] auth state written to ${statePath}`);

  await page.close();
  await context.close();
  await browser.close();
}
