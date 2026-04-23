#!/usr/bin/env node
/**
 * End-to-end perf-prod orchestrator.
 *
 * 1. Health-check prod URL. Fail loudly on 4xx/5xx/timeout — a misleading
 *    green report from a local preview is worse than no report.
 * 2. Wipe perf-artifacts/ (stale JSON would poison the report).
 * 3. Run Playwright perf specs (JSON reporter).
 * 4. Run Lighthouse (per-route HTML+JSON).
 * 5. Build perf-report.md + perf-report.json.
 * 6. Print summary + path.
 *
 * --local fallback: use http://localhost:4173 after `npm run build && npm run preview`.
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const useLocal = args.includes("--local");
const BASE =
  process.env.STREAMVAULT_PROD_URL ??
  (useLocal
    ? "http://localhost:4173"
    : "https://streamvault.srinivaskotha.uk");
const OUT = resolve(process.cwd(), "perf-artifacts");

function log(msg) {
  console.log(`[perf] ${msg}`);
}

async function health() {
  log(`health-check ${BASE} …`);
  try {
    const res = await fetch(BASE, { method: "GET", redirect: "follow" });
    if (!res.ok) {
      console.error(`[perf] ${BASE} returned HTTP ${res.status}. Aborting.`);
      process.exit(2);
    }
    log(`${BASE} → ${res.status} ✓`);
  } catch (err) {
    console.error(`[perf] ${BASE} unreachable:`, err.message);
    console.error(
      "[perf] Use `--local` to run against a local preview build instead.",
    );
    process.exit(2);
  }
}

function run(cmd, cmdArgs, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const p = spawn(cmd, cmdArgs, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    p.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  // Require env for the auth-using steps; surface clearly.
  if (!process.env.STREAMVAULT_E2E_USER || !process.env.STREAMVAULT_E2E_PASS) {
    console.error(
      "[perf] STREAMVAULT_E2E_USER and STREAMVAULT_E2E_PASS must be set.",
    );
    process.exit(2);
  }

  await health();

  if (existsSync(OUT)) {
    rmSync(OUT, { recursive: true, force: true });
  }
  mkdirSync(OUT, { recursive: true });

  const env = {
    STREAMVAULT_PROD_URL: BASE,
  };

  log("Running Playwright perf specs …");
  await run("npx", ["playwright", "test", "--config=playwright.perf.config.ts"], env);

  log("Running Lighthouse per-route …");
  await run("node", ["tests/perf/lighthouse-routes.mjs"], env);

  log("Building report …");
  await run("node", ["scripts/build-perf-report.mjs"], env);

  log(`Done. See ${resolve(process.cwd(), "perf-report.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
