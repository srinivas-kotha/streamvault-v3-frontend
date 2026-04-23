#!/usr/bin/env node
/**
 * Builds perf-report.md + perf-report.json from:
 *  - perf-artifacts/playwright-metrics.json   (Playwright JSON reporter)
 *  - perf-artifacts/lh-<route>.json           (Lighthouse per-route)
 *
 * Maps metric thresholds → suspect code paths (pre-wired from the plan's
 * Known Hotspots list). The mapping is intentionally opinionated — if a
 * metric crosses AMBER/RED, we already know which code paths to investigate.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "perf-artifacts");
const MD_OUT = resolve(process.cwd(), "perf-report.md");
const JSON_OUT = resolve(process.cwd(), "perf-report.json");

// ── Threshold table (also documented in the plan + tests/perf/README.md) ───
const T = {
  LCP: { green: 2500, amber: 4000 }, // ms
  INP: { green: 200, amber: 500 }, // ms
  CLS: { green: 0.1, amber: 0.25 }, // unitless
  TBT: { green: 200, amber: 600 }, // ms
  transition: { green: 300, amber: 800 }, // ms
  longTasksDuringTransition: { green: 0, amber: 2 }, // count
  droppedFramePct: { green: 5, amber: 15 }, // %
  heapDeltaMB: { green: 10, amber: 30 }, // MB
};

// ── Suspect-file map (plan's Known Hotspots) ──────────────────────────────
const SUSPECTS = {
  lcp: [
    "[vite.config.ts](vite.config.ts) — no manualChunks; everything ships in one bundle",
    "[src/App.tsx:12-34](src/App.tsx#L12-L34) — all routes eagerly imported (SeriesDetailRoute is 1,421 lines)",
    "[src/features/movies/MovieCard.tsx:218](src/features/movies/MovieCard.tsx#L218) — posters have loading=\"lazy\" but no decoding=\"async\"",
  ],
  inp: [
    "[src/App.tsx:267-308](src/App.tsx#L267-L308) — focus-recovery keyup handler on every D-pad press",
    "[src/routes/MoviesRoute.tsx:485](src/routes/MoviesRoute.tsx#L485) — sticky toolbar backdrop-filter blur",
  ],
  cls: [
    "[src/features/movies/MovieCard.tsx:218](src/features/movies/MovieCard.tsx#L218) — images without explicit width/height (layout shift on late decode)",
  ],
  transition: [
    "[src/App.tsx:12-34](src/App.tsx#L12-L34) — eager route imports; destination route's JS already parsed but executed with throttled CPU",
    "[src/routes/MoviesRoute.tsx:554-561](src/routes/MoviesRoute.tsx#L554-L561) — movies-pulse 900ms infinite animation consumes main-thread time during transition",
  ],
  longTasks: [
    "[src/routes/SeriesDetailRoute.tsx](src/routes/SeriesDetailRoute.tsx) — 1,421-line component, heaviest single mount in the app",
    "[src/App.tsx:267-308](src/App.tsx#L267-L308) — focus-recovery keyup, can block main thread briefly",
  ],
  droppedFrames: {
    series: [
      "[src/features/series/SeriesGrid.tsx](src/features/series/SeriesGrid.tsx) — plain CSS Grid, NOT virtualized (contrast MovieGrid's react-virtuoso)",
    ],
    movies: [
      "[src/features/movies/MovieCard.tsx:218](src/features/movies/MovieCard.tsx#L218) — missing decoding=\"async\" causes main-thread decode stalls on scroll",
    ],
  },
  heap: [
    "[src/routes/SeriesDetailRoute.tsx](src/routes/SeriesDetailRoute.tsx) — 1,421-line component allocates a lot of state+JSX on mount",
    "[src/App.tsx:12-34](src/App.tsx#L12-L34) — eager imports keep all route modules resident even when unused",
  ],
  tvUnused: [
    "[src/main.tsx:17-26](src/main.tsx#L17-L26) — data-tv=\"true\" is set but [tokens.css](src/brand/tokens.css) has no [data-tv=\"true\"] selectors reducing animation / blur / backdrop-filter",
  ],
};

// ── Tier function ──────────────────────────────────────────────────────────
function tier(value, { green, amber }, lowerIsBetter = true) {
  if (value == null || Number.isNaN(value)) return "N/A";
  if (lowerIsBetter) {
    if (value <= green) return "🟢 GREEN";
    if (value <= amber) return "🟡 AMBER";
    return "🔴 RED";
  }
  if (value >= green) return "🟢 GREEN";
  if (value >= amber) return "🟡 AMBER";
  return "🔴 RED";
}

function fmtMs(v) {
  return v == null ? "—" : `${Math.round(v)}ms`;
}
function fmtBytes(v) {
  return v == null ? "—" : `${(v / 1_048_576).toFixed(1)} MB`;
}
function fmtCls(v) {
  return v == null ? "—" : v.toFixed(3);
}

// ── Ingest Playwright attachments ─────────────────────────────────────────
function readPlaywrightAttachments() {
  const path = resolve(OUT, "playwright-metrics.json");
  if (!existsSync(path)) return { byName: {} };
  const pw = JSON.parse(readFileSync(path, "utf8"));
  const byName = {};
  for (const suite of pw.suites ?? []) {
    walkSuite(suite, byName);
  }
  return { byName };
}

function walkSuite(suite, byName) {
  for (const s of suite.suites ?? []) walkSuite(s, byName);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      for (const r of t.results ?? []) {
        for (const a of r.attachments ?? []) {
          if (a.name?.startsWith("perf-") && a.path) {
            try {
              const parsed = JSON.parse(readFileSync(a.path, "utf8"));
              byName[a.name] = parsed;
            } catch (err) {
              console.warn(`[report] failed to parse ${a.name}:`, err.message);
            }
          } else if (a.name?.startsWith("perf-") && a.body) {
            try {
              byName[a.name] = JSON.parse(
                Buffer.from(a.body, "base64").toString("utf8"),
              );
            } catch {
              /* */
            }
          }
        }
      }
    }
  }
}

// ── Ingest Lighthouse JSONs ───────────────────────────────────────────────
function readLighthouse() {
  if (!existsSync(OUT)) return {};
  const files = readdirSync(OUT).filter(
    (f) => f.startsWith("lh-") && f.endsWith(".json"),
  );
  const out = {};
  for (const f of files) {
    try {
      const lhr = JSON.parse(readFileSync(resolve(OUT, f), "utf8"));
      const route = f.replace(/^lh-/, "").replace(/\.json$/, "");
      out[route] = {
        lcp: lhr.audits?.["largest-contentful-paint"]?.numericValue,
        cls: lhr.audits?.["cumulative-layout-shift"]?.numericValue,
        tbt: lhr.audits?.["total-blocking-time"]?.numericValue,
        tti: lhr.audits?.["interactive"]?.numericValue,
        fcp: lhr.audits?.["first-contentful-paint"]?.numericValue,
        cpuSlowdownMultiplier:
          lhr.configSettings?.throttling?.cpuSlowdownMultiplier,
      };
    } catch (err) {
      console.warn(`[report] failed to parse ${f}:`, err.message);
    }
  }
  return out;
}

// ── Build report ──────────────────────────────────────────────────────────
function build() {
  const { byName } = readPlaywrightAttachments();
  const lh = readLighthouse();

  const dock = byName["perf-dock-transitions.json"];
  const cardToDetail = byName["perf-card-to-detail.json"];
  const backNav = byName["perf-back-navigation.json"];
  const gridMovies = byName["perf-grid-scroll-movies.json"];
  const gridSeries = byName["perf-grid-scroll-series.json"];

  const cpuRate =
    dock?.cpuRate ??
    cardToDetail?.cpuRate ??
    backNav?.cpuRate ??
    gridMovies?.cpuRate ??
    "?";
  const heapMethod =
    cardToDetail?.measurementMethod ?? dock?.measurementMethod ?? "unknown";

  const lines = [];
  lines.push(`# StreamVault v3 perf report`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- CPU throttle rate: **${cpuRate}×**`);
  lines.push(`- Heap measurement method: **${heapMethod}**`);
  lines.push(`- Target: \`${process.env.STREAMVAULT_PROD_URL ?? "(default)"}\``);
  lines.push("");
  lines.push("## Legend");
  lines.push("");
  lines.push(
    "| Metric | 🟢 GREEN | 🟡 AMBER | 🔴 RED |",
  );
  lines.push("|---|---|---|---|");
  lines.push(`| LCP | <${T.LCP.green}ms | ${T.LCP.green}–${T.LCP.amber}ms | >${T.LCP.amber}ms |`);
  lines.push(`| INP | <${T.INP.green}ms | ${T.INP.green}–${T.INP.amber}ms | >${T.INP.amber}ms |`);
  lines.push(`| CLS | <${T.CLS.green} | ${T.CLS.green}–${T.CLS.amber} | >${T.CLS.amber} |`);
  lines.push(`| TBT (Lighthouse) | <${T.TBT.green}ms | ${T.TBT.green}–${T.TBT.amber}ms | >${T.TBT.amber}ms |`);
  lines.push(`| Transition | <${T.transition.green}ms | ${T.transition.green}–${T.transition.amber}ms | >${T.transition.amber}ms |`);
  lines.push(`| Long tasks / transition | ${T.longTasksDuringTransition.green} | 1–${T.longTasksDuringTransition.amber} | >${T.longTasksDuringTransition.amber} |`);
  lines.push(`| Dropped frame % | <${T.droppedFramePct.green}% | ${T.droppedFramePct.green}–${T.droppedFramePct.amber}% | >${T.droppedFramePct.amber}% |`);
  lines.push(`| Heap delta (detail enter) | <${T.heapDeltaMB.green}MB | ${T.heapDeltaMB.green}–${T.heapDeltaMB.amber}MB | >${T.heapDeltaMB.amber}MB |`);
  lines.push("");

  // ── Lighthouse per-route ────────────────────────────────────────────────
  lines.push("## Lighthouse per-route (cold load)");
  lines.push("");
  lines.push("| Route | LCP | CLS | TBT | TTI |");
  lines.push("|---|---|---|---|---|");
  const LH_ROUTES = ["home", "movies", "series", "live", "search", "settings"];
  for (const r of LH_ROUTES) {
    const m = lh[r];
    if (!m) continue;
    lines.push(
      `| /${r === "home" ? "" : r} | ${fmtMs(m.lcp)} ${tier(m.lcp, T.LCP)} | ${fmtCls(m.cls)} ${tier(m.cls, T.CLS)} | ${fmtMs(m.tbt)} ${tier(m.tbt, T.TBT)} | ${fmtMs(m.tti)} |`,
    );
  }
  lines.push("");

  // ── Dock transitions ────────────────────────────────────────────────────
  if (dock?.hops?.length) {
    lines.push("## Dock transitions (click, throttled)");
    lines.push("");
    lines.push("| From | To | Transition | Long tasks during |");
    lines.push("|---|---|---|---|");
    for (const h of dock.hops) {
      const longCount = h.longTasksDuringTransition?.length ?? 0;
      lines.push(
        `| /${h.from} | /${h.to} | ${fmtMs(h.transitionMs)} ${tier(h.transitionMs, T.transition)} | ${longCount} ${tier(longCount, T.longTasksDuringTransition)} |`,
      );
    }
    lines.push("");
  }

  // ── Card → Detail ───────────────────────────────────────────────────────
  if (cardToDetail) {
    const heapDeltaBytes = cardToDetail.heapDeltaBytes ?? 0;
    const heapDeltaMB = heapDeltaBytes / 1_048_576;
    const longCount = cardToDetail.longTasksDuringTransition?.length ?? 0;
    lines.push("## Series card → /series/:id detail");
    lines.push("");
    lines.push("| Metric | Value | Tier |");
    lines.push("|---|---|---|");
    lines.push(
      `| Transition | ${fmtMs(cardToDetail.transitionMs)} | ${tier(cardToDetail.transitionMs, T.transition)} |`,
    );
    lines.push(`| Long tasks during | ${longCount} | ${tier(longCount, T.longTasksDuringTransition)} |`);
    lines.push(
      `| Heap before | ${fmtBytes(cardToDetail.heapBeforeBytes)} | — |`,
    );
    lines.push(
      `| Heap after | ${fmtBytes(cardToDetail.heapAfterBytes)} | — |`,
    );
    lines.push(
      `| Heap delta | ${fmtBytes(heapDeltaBytes)} | ${tier(heapDeltaMB, T.heapDeltaMB)} |`,
    );
    lines.push("");
  }

  // ── Back navigation ─────────────────────────────────────────────────────
  if (backNav) {
    const longCount = backNav.longTasksDuringTransition?.length ?? 0;
    lines.push("## /series/:id → Back → /series");
    lines.push("");
    lines.push("| Metric | Value | Tier |");
    lines.push("|---|---|---|");
    lines.push(
      `| Transition | ${fmtMs(backNav.transitionMs)} | ${tier(backNav.transitionMs, T.transition)} |`,
    );
    lines.push(
      `| Long tasks during | ${longCount} | ${tier(longCount, T.longTasksDuringTransition)} |`,
    );
    lines.push("");
  }

  // ── Grid scroll ─────────────────────────────────────────────────────────
  if (gridMovies || gridSeries) {
    lines.push("## Grid D-pad scroll (30 ArrowDown presses)");
    lines.push("");
    lines.push("| Route | Frames sampled | Dropped | % dropped | p50 | p95 | p99 |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const [name, g] of [
      ["/movies", gridMovies],
      ["/series", gridSeries],
    ]) {
      if (!g) continue;
      lines.push(
        `| ${name} | ${g.totalFramesSampled} | ${g.droppedFrames} | ${g.droppedFramePct.toFixed(1)}% ${tier(g.droppedFramePct, T.droppedFramePct)} | ${g.frameDeltaMs.p50.toFixed(1)}ms | ${g.frameDeltaMs.p95.toFixed(1)}ms | ${g.frameDeltaMs.p99.toFixed(1)}ms |`,
      );
    }
    lines.push("");
  }

  // ── Suspect hot paths (conditional on findings) ─────────────────────────
  lines.push("## Suspect files (if any tier above is AMBER/RED)");
  lines.push("");

  const flags = new Set();
  for (const r of LH_ROUTES) {
    const m = lh[r];
    if (!m) continue;
    if (tier(m.lcp, T.LCP) !== "🟢 GREEN") flags.add("lcp");
    if (tier(m.cls, T.CLS) !== "🟢 GREEN") flags.add("cls");
    if (tier(m.tbt, T.TBT) !== "🟢 GREEN") flags.add("tbt");
  }
  for (const h of dock?.hops ?? []) {
    if (tier(h.transitionMs, T.transition) !== "🟢 GREEN") flags.add("transition");
    if (
      tier(
        h.longTasksDuringTransition?.length ?? 0,
        T.longTasksDuringTransition,
      ) !== "🟢 GREEN"
    )
      flags.add("longTasks");
  }
  if (cardToDetail) {
    if (tier(cardToDetail.transitionMs, T.transition) !== "🟢 GREEN")
      flags.add("transition");
    const heapMB = (cardToDetail.heapDeltaBytes ?? 0) / 1_048_576;
    if (tier(heapMB, T.heapDeltaMB) !== "🟢 GREEN") flags.add("heap");
  }
  if (gridMovies && tier(gridMovies.droppedFramePct, T.droppedFramePct) !== "🟢 GREEN")
    flags.add("droppedFrames-movies");
  if (gridSeries && tier(gridSeries.droppedFramePct, T.droppedFramePct) !== "🟢 GREEN")
    flags.add("droppedFrames-series");

  if (flags.size === 0) {
    lines.push("_All GREEN — no suspects surfaced. Re-run at higher throttle rate (`PERF_CPU_RATE=6`) if the user still reports lag._");
  } else {
    if (flags.has("lcp")) listSuspects(lines, "LCP / first paint", SUSPECTS.lcp);
    if (flags.has("cls")) listSuspects(lines, "CLS / layout shift", SUSPECTS.cls);
    if (flags.has("tbt") || flags.has("longTasks"))
      listSuspects(
        lines,
        "TBT / main-thread blocking",
        [...SUSPECTS.inp, ...SUSPECTS.longTasks],
      );
    if (flags.has("transition"))
      listSuspects(lines, "Slow transitions", SUSPECTS.transition);
    if (flags.has("droppedFrames-movies"))
      listSuspects(lines, "Movies grid dropped frames", SUSPECTS.droppedFrames.movies);
    if (flags.has("droppedFrames-series"))
      listSuspects(lines, "Series grid dropped frames", SUSPECTS.droppedFrames.series);
    if (flags.has("heap")) listSuspects(lines, "Heap growth on detail enter", SUSPECTS.heap);
    lines.push("");
    lines.push(
      "### TV-specific ambient suspects (always worth checking on Fire TV)",
    );
    lines.push("");
    for (const s of SUSPECTS.tvUnused) lines.push(`- ${s}`);
    lines.push("");
  }

  // ── Reproducibility hints ───────────────────────────────────────────────
  lines.push("## Reproducibility");
  lines.push("");
  lines.push("- Baseline sanity: `PERF_BASELINE=1 npm run perf:prod` — throttling disabled; LCP on /home should be <1.5s. If not, the network between the runner and prod is the bottleneck, not the app.");
  lines.push("- Rate comparison: set `PERF_CPU_RATE=4` (Stick 4K) vs `PERF_CPU_RATE=6` (Stick Lite). Numbers should scale roughly linearly in LCP/TBT; non-linear scaling = network-bound regime.");
  lines.push("- Stddev check: run 3×, per-metric stddev should be <15% on GREEN routes. Higher = rogue background CPU on the runner.");
  lines.push("");

  writeFileSync(MD_OUT, lines.join("\n"));
  writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cpuRate,
        heapMethod,
        playwright: byName,
        lighthouse: lh,
        flags: [...flags],
      },
      null,
      2,
    ),
  );
  console.log(`[report] wrote ${MD_OUT}`);
  console.log(`[report] wrote ${JSON_OUT}`);
}

function listSuspects(lines, title, items) {
  lines.push(`### ${title}`);
  lines.push("");
  for (const s of items) lines.push(`- ${s}`);
  lines.push("");
}

build();
