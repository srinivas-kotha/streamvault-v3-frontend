# StreamVault v3 — Production E2E Regression Suite

> "When green, the app is user-ready without any manual check."

## What this suite covers

| Spec | Scenarios |
|------|-----------|
| `login-and-dock.spec.ts` | Login → dock focus-primes → full D-pad walk → Enter navigates → visual baseline |
| `movies-browse.spec.ts` | Dock enter on Movies → grid loads → D-pad traversal → category strip → visual |
| `series-browse.spec.ts` | Dock enter on Series → grid loads → D-pad traversal → visual |
| `search-flow.spec.ts` | Dock enter on Search → type query → results within 6s → D-pad in results → visual |
| `settings-flow.spec.ts` | Dock enter on Settings → username shown → pref toggle → localStorage → visual |
| `favorites-smoke.spec.ts` | Navigate to /favorites → content or empty state → D-pad traversal → visual |
| `player-smoke.spec.ts` | Enter on channel → `<video>` in DOM → readyState ≥ 2 in 30s → Escape closes → visual |
| `full-user-journey.spec.ts` | Complete golden path: login → dock walk → player → favorites → search → settings |
| `a11y-smoke.spec.ts` | axe-core audit on every route — zero serious/critical violations |
| `error-recovery.spec.ts` | Block API → ErrorShell → Retry → content loads (PR #28 regression guard) |
| `performance-baseline.spec.ts` | FCP < 3s and Movies TTI < 5s on desktop-chrome |
| `keyboard-only.spec.ts` | Full app navigable with arrows + Enter + Escape only (no mouse) |
| `tv-viewport.spec.ts` | 1920x1080 no horizontal overflow, dock full-width, per-route screenshots |
| `reduced-motion.spec.ts` | Shimmer disabled, focus scale(1), retry pulse static under prefers-reduced-motion |

## Running locally

### Prerequisites

```bash
export STREAMVAULT_E2E_USER=<your-test-username>
export STREAMVAULT_E2E_PASS=<your-test-password>
# Optional: override the live URL
export STREAMVAULT_PROD_URL=https://streamvault.srinivaskotha.uk
```

### Run the full suite

```bash
npm run test:e2e:prod
```

### Run a single spec

```bash
npx playwright test tests/prod/full-user-journey.spec.ts \
  --config=playwright.prod.config.ts \
  --headed
```

### Run on a specific project (browser / viewport)

```bash
npx playwright test --config=playwright.prod.config.ts \
  --project=fire-tv-1080p
```

Projects defined in `playwright.prod.config.ts`:
- `fire-tv-1080p` — Chrome 1920×1080, matches Fire TV Stick 4K
- `desktop-chrome` — Chrome 1280×720
- `webkit-ipad` — WebKit iPad Pro 11"

## Updating visual baselines

After an intentional UI change, regenerate the snapshots:

```bash
npm run test:e2e:prod -- --update-snapshots
```

Commit the new `*.png` files alongside your UI change PR so reviewers can diff them.

Snapshots live at:
```
tests/prod/*.spec.ts-snapshots/
```

## Debugging a failure

### 1. HTML report

```bash
npx playwright show-report playwright-report-prod
```

### 2. Traces (step-by-step replay)

Traces are captured on failure (see `playwright.prod.config.ts` — `trace: "retain-on-failure"`).

Open a trace:
```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

### 3. Videos

Videos are retained on failure (`video: "retain-on-failure"`).
Find them in `test-results/<test-name>/video.webm`.

### 4. CI artifacts

On failure, the `Prod smoke` GitHub Actions job uploads:
- `playwright-report-prod-<run-id>` — full HTML report
- `playwright-traces-prod-<run-id>` — zip traces per failing test

Download from the Actions run → Artifacts section.

### 5. Common failure patterns

| Symptom | Likely cause |
|---------|-------------|
| Login times out (`input#username` not found) | Deploy in progress; retry after deploy settles |
| `STREAMVAULT_E2E_USER` error | Env vars not set — see Prerequisites above |
| Player tests skipped | Xtream rate-limit (HTTP 429/403) — these skip, not fail |
| Visual diff failure | UI intentionally changed — run `--update-snapshots` |
| axe violations | New component introduced without ARIA labels — fix the component |
| FCP > 3s | Bundle bloat regression — check `npm run check-budget` |

## CI integration

The `prod-smoke.yml` workflow:
- Triggers after every successful `Deploy` workflow on `main`
- Also runs daily at 06:00 UTC
- Does **not** block merges (`continue-on-error: true`)
- Uploads HTML report and traces as artifacts on every run

To enable: add `STREAMVAULT_E2E_USER` and `STREAMVAULT_E2E_PASS` to
repo Settings → Secrets and variables → Actions.
