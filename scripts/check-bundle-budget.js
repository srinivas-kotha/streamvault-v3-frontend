#!/usr/bin/env node
// Phase 0: generous cap to catch gross regressions (1.5 MB total JS gzip).
// Tightened per phase — see comments below.
//
// Tightening schedule (update LIMIT_KB + add per-chunk rules as we progress):
//   Phase 0  -> TOTAL_LIMIT_KB = 1500       (this file)
//   Phase 1  -> TOTAL_LIMIT_KB = 800        (after primitives land)
//   Phase 3  -> TOTAL_LIMIT_KB = 600        (after API client + auth land)
//   Phase 5a -> per-chunk rules: main <= 400 KB, player <= 200 KB,
//               AND hls.js must appear ONLY in a chunk whose name contains
//               "player" or "hls" (grep the chunk manifest).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import zlib from "node:zlib";

const DIST = "dist/assets";
const TOTAL_LIMIT_KB = 600; // Phase 3 cap — API client + auth landed (Phase 3 DoD requirement).

if (!existsSync(DIST)) {
  console.error(`dist/ missing — run 'npm run build' first.`);
  process.exit(1);
}

const jsFiles = readdirSync(DIST).filter((f) => extname(f) === ".js");
let totalBytes = 0;
for (const f of jsFiles) {
  const gz = zlib.gzipSync(readFileSync(join(DIST, f))).length;
  totalBytes += gz;
  console.log(`  ${f}: ${Math.round(gz / 1024)} KB gzip`);
}
const totalKb = Math.round(totalBytes / 1024);
console.log(`Total JS: ${totalKb} KB gzip (limit ${TOTAL_LIMIT_KB} KB)`);
if (totalKb > TOTAL_LIMIT_KB) {
  console.error(`Bundle budget FAIL: ${totalKb} > ${TOTAL_LIMIT_KB}`);
  process.exit(1);
}
console.log("Bundle budget PASS");
