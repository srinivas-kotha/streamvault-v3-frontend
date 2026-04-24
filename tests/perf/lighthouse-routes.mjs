#!/usr/bin/env node
/**
 * Lighthouse audit for each logged-in route on prod.
 *
 * Why programmatic `lighthouse` and not `@lhci/cli`? LHCI's value is PR-history
 * trending — we don't need that yet (see plan). `lighthouse` the library lets
 * us inject auth + tune CPU throttling per Fire TV class.
 *
 * Auth: Lighthouse doesn't persist login. We launch Chrome via chrome-launcher,
 * connect Playwright over CDP for the login step (reuses our existing
 * Playwright dep — no puppeteer needed), dump cookies + localStorage, then run
 * Lighthouse against the same Chrome instance with auth pre-seeded.
 *
 * Output: `perf-artifacts/lh-<route>.json` per route.
 *
 * Env:
 *   STREAMVAULT_PROD_URL  — default https://streamvault.srinivaskotha.uk
 *   STREAMVAULT_E2E_USER  — login (required)
 *   STREAMVAULT_E2E_PASS  — login (required)
 *   PERF_CPU_RATE         — default 6. Mobile Slow 4G baseline.
 */
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

// chrome-launcher auto-discovers Chrome/Chromium on desktop installs but
// can't find Playwright's bundled browser on headless VPSes. Point
// CHROME_PATH at the newest Playwright-installed chromium binary if the
// user hasn't set it explicitly.
if (!process.env.CHROME_PATH) {
  const pwCache = join(homedir(), ".cache/ms-playwright");
  if (existsSync(pwCache)) {
    const dirs = readdirSync(pwCache)
      .filter((d) => d.startsWith("chromium-") && !d.includes("headless"))
      .sort()
      .reverse();
    for (const dir of dirs) {
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const p = join(pwCache, dir, sub);
        if (existsSync(p)) {
          process.env.CHROME_PATH = p;
          break;
        }
      }
      if (process.env.CHROME_PATH) break;
    }
  }
}

const BASE =
  process.env.STREAMVAULT_PROD_URL ?? "https://streamvault.srinivaskotha.uk";
const USER = process.env.STREAMVAULT_E2E_USER;
const PASS = process.env.STREAMVAULT_E2E_PASS;
const RATE = Number(process.env.PERF_CPU_RATE ?? 6);
const OUT = resolve(process.cwd(), "perf-artifacts");

const ROUTES = ["/movies", "/series", "/live", "/search", "/settings"];

async function main() {
  if (!USER || !PASS) {
    console.error(
      "Missing STREAMVAULT_E2E_USER / STREAMVAULT_E2E_PASS. Aborting.",
    );
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

  const chrome = await chromeLauncher.launch({
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--enable-precise-memory-info",
      "--remote-debugging-port=0", // chrome-launcher picks the port
    ],
  });

  const settings = {
    formFactor: "mobile",
    throttlingMethod: "simulate",
    throttling: {
      cpuSlowdownMultiplier: RATE,
      rttMs: 750,
      throughputKbps: 1600,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
    screenEmulation: {
      mobile: false,
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      disabled: false,
    },
    emulatedUserAgent:
      "Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7288.4122N) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Silk/119.3.3 like Chrome/119.0.6045.193 Safari/537.36",
    onlyCategories: ["performance"],
  };

  // ── 1. Login via Playwright over CDP, dump auth state ───────────────────
  const browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${chrome.port}`,
  );
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const loginPage = await context.newPage();
  await loginPage.goto(BASE);
  await loginPage.waitForSelector("input#username", { timeout: 15_000 });
  await loginPage.fill("input#username", USER);
  await loginPage.fill("input#password", PASS);
  await loginPage.click('button[type="submit"]');
  await loginPage.waitForSelector('nav[aria-label="Main navigation"]', {
    timeout: 15_000,
  });
  const cookies = await context.cookies();
  const storage = await loginPage.evaluate(() => ({
    access: localStorage.getItem("sv_access_token"),
    refresh: localStorage.getItem("sv_refresh_token"),
  }));
  await loginPage.close();

  // ── 2. Per-route Lighthouse run. Before each audit, seed localStorage on a
  // scratch page in the same Chrome — Lighthouse will open its own page but
  // same-origin localStorage is shared with any existing same-origin tab in
  // the same Chrome profile. Cookies are context-wide already.
  for (const route of ROUTES) {
    const url = `${BASE}${route}`;
    console.log(`[lh] ${route} …`);

    const seed = await context.newPage();
    await seed.goto(BASE, { waitUntil: "domcontentloaded" });
    await seed.evaluate(
      (s) => {
        if (s.access) localStorage.setItem("sv_access_token", s.access);
        if (s.refresh) localStorage.setItem("sv_refresh_token", s.refresh);
      },
      storage,
    );
    await seed.close();

    let lhr;
    try {
      const result = await lighthouse(
        url,
        { port: chrome.port },
        { extends: "lighthouse:default", settings },
      );
      lhr = result?.lhr;
    } catch (err) {
      console.error(`[lh] ${route} audit failed:`, err);
      continue;
    }

    const filename =
      route.replace(/^\//, "").replace(/\//g, "-") || "home";
    const outPath = resolve(OUT, `lh-${filename}.json`);
    writeFileSync(outPath, JSON.stringify(lhr, null, 2));
    console.log(`[lh] ${route} → ${outPath}`);
  }

  await browser.close();
  await chrome.kill();
}

// Cookies object note: Playwright Cookie uses `expires` (seconds) and
// `sameSite`; chrome-remote-interface uses different casing. We don't set
// cookies — we just read them (Playwright set them naturally during login),
// so no conversion is needed.

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
