# Fire TV perf suite

Reproducibly measures navigation lag on a low-RAM TV class against production.
Answers the question: _when the user says "navigation gets stuck", where in the
code is it actually stuck?_

**Non-goal:** this suite does not fix any perf issue. It measures and points at
suspect files. Fixing is a separate PR.

## Quick start

```bash
# One-time: install Playwright browsers if you haven't.
npx playwright install chromium

# Set auth for prod.
export STREAMVAULT_E2E_USER=sv_e2e_test
export STREAMVAULT_E2E_PASS=<redacted>

# Default: Fire TV Stick Lite class (6× CPU + Slow 4G).
npm run perf:prod
cat perf-report.md

# Baseline sanity (no throttling — should be fast).
PERF_BASELINE=1 npm run perf:prod

# Fire TV Stick 4K / Max class (lighter throttle).
PERF_CPU_RATE=4 npm run perf:prod

# Against local preview (when prod is unreachable).
npm run build && npm run preview &
npm run perf:prod -- --local
```

## What it runs

1. **Playwright perf specs** against prod, headless Chromium with CDP CPU
   throttling (6×), Slow 4G network, Silk UA:
   - `dock-transitions.spec.ts` — click through every dock tab; per-hop time + long tasks
   - `card-to-detail.spec.ts` — Series card → `/series/:id`; heap delta + long tasks
   - `back-navigation.spec.ts` — detail → Back; restoration cost
   - `grid-scroll.spec.ts` — D-pad Down ×30 on /movies + /series; dropped frame %
2. **Lighthouse** per route (`/movies`, `/series`, `/live`, `/search`,
   `/settings`) with the same throttling preset.
3. **Report** combines both into `perf-report.md` (terminal-friendly) +
   `perf-report.json` (diffable).

## Output

All artifacts in `perf-artifacts/`:

- `playwright-metrics.json` — Playwright JSON reporter
- `lh-<route>.json` — Lighthouse per-route
- `perf-report.md` / `perf-report.json` — final report (in repo root)

## Thresholds

| Metric | 🟢 GREEN | 🟡 AMBER | 🔴 RED |
|---|---|---|---|
| LCP | <2.5s | 2.5–4s | >4s |
| INP | <200ms | 200–500ms | >500ms |
| CLS | <0.1 | 0.1–0.25 | >0.25 |
| TBT | <200ms | 200–600ms | >600ms |
| Transition (click → paint) | <300ms | 300–800ms | >800ms |
| Long tasks / transition | 0 | 1–2 | 3+ |
| Dropped frame % (grid scroll) | <5% | 5–15% | >15% |
| Heap delta (detail enter) | <10MB | 10–30MB | >30MB |

AMBER/RED cells are hyperlinked in the report to the suspect source files
(see `scripts/build-perf-report.mjs` `SUSPECTS` map).

## Headless VPS

Runs headlessly on any Linux VPS — no X server required. Bundled Chromium is
downloaded by `npx playwright install chromium` into `~/.cache/ms-playwright`.
Chrome launch flags (`--headless=new --no-sandbox --disable-dev-shm-usage
--disable-gpu --enable-precise-memory-info`) are set for you.

To view Lighthouse's HTML report (optional — the numbers are already in
`perf-report.md`):

```bash
npm run perf:serve  # python3 -m http.server 8080 --directory perf-artifacts
# From your laptop:
ssh -L 8080:localhost:8080 <vps>
# Open http://localhost:8080/lh-movies.html in browser
```

## Verifying the numbers are real

Run through these sanity checks before trusting the report:

| Check | Expected | If off |
|---|---|---|
| `PERF_BASELINE=1` vs default | ~3–5× LCP ratio | CDP throttling not applied (check `Emulation.setCPUThrottlingRate` order in `fixtures.ts`) |
| `navigator.userAgent` in tests | contains "Silk" | UA override not propagating |
| `documentElement.dataset.tv` | `"true"` | UA sniff in `src/main.tsx:17-26` not matching — file an app bug |
| `window.__svVitals` after nav | has LCP + CLS | init-script CSP block or web-vitals IIFE load failed |
| `lhr.configSettings.throttling.cpuSlowdownMultiplier` | 6 (or 4) | Lighthouse CLI overrode settings — check invocation |
| `SeriesDetailRoute` enter produces ≥1 long task | ≥1 | PerformanceObserver registered too late |
| Heap delta on `/settings` alone | <2MB | GC noise; increase post-navigation settle |
| 3× runs, stddev | <15% on GREEN routes | non-deterministic: rogue bg CPU or leaked CDP session |

## How to extend

Add another hop, route, or transition:

- **New dock hop:** append to `HOPS` in `dock-transitions.spec.ts`.
- **New Lighthouse route:** append to `ROUTES` in `lighthouse-routes.mjs`.
- **New suspect mapping:** edit `SUSPECTS` in `scripts/build-perf-report.mjs`.
- **Different throttle:** `PERF_CPU_RATE=<N>` env var wins over project metadata.

## Why no CI job yet

The suite is inherently variable — runner CPU contention can swing metrics ±15%.
Adding a red-gate-on-PR would either need wide thresholds (useless) or flake
heavily. Run manually until we have a trend baseline; then consider a nightly
cron that uploads the report as a PR comment.

## Known limitations

- `performance.measureUserAgentSpecificMemory()` requires crossOriginIsolated
  (COOP+COEP) — StreamVault prod doesn't send those headers. We fall back to
  `performance.memory.usedJSHeapSize` (Chrome only, less accurate). The report
  stamps `measurementMethod: "precise" | "fallback"` so you know which was used.
- Grid-scroll test seeds focus by clicking the first card — D-pad focus handoff
  from the dock is brittle in headless and is NOT what this test measures.
- Lighthouse auth uses Playwright's CDP connection to `chrome-launcher`'s
  Chrome instance (cookies + localStorage seeded before each audit). If prod's
  auth model changes, update the seeding block in `lighthouse-routes.mjs`.
