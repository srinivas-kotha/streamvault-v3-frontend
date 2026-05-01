# StreamVault v3 Adaptive Responsive — QA Matrix & Gates

**QA Lead:** Claude Sonnet (QA agent)
**Date:** 2026-04-29
**Scope:** Adaptive responsive layer (Desktop + Mobile + Tablet) on top of existing Fire TV codebase
**Physical-device testing:** NONE during this phase. All validation uses Playwright touch/keyboard emulation, visual regression baselines, and screencasts only. See §10 for the explicit lab gap list.

---

## 1. Current Test Surface

### 1.1 Unit / Integration (Vitest)

| Area | Files | Notes |
|---|---|---|
| Route components | 7 (`LiveRoute`, `MoviesRoute`, `SeriesRoute`, `SearchRoute`, `FavoritesRoute`, `SettingsRoute`, `HistoryRoute`) | Each has a `.test.tsx` |
| Nav / focus | 4 (`backStack`, `spatialNav`, `BottomDock`, `SilkProbe`) | SilkProbe detects Fire TV UA |
| Player | 4 (`useHlsPlayer`, `PlayerShell`, `PlayerControls`, `classifyFailure`) | HLS mock via vi.mock |
| API + schema | 4 (`auth`, `client`, `live`, `schemas`) | Zod schema tests |
| Primitives | 5 (`Card`, `FocusRing`, `Button`, `Skeleton`, `cx`) | Design-system primitives |
| Telemetry | 1 (`index`) | Analytics events |
| Language | 2 (`inferLanguage`, `useLangPref`) | 50+ regex patterns |
| Brand tokens | 1 (`tokens`) | CSS custom-property existence |
| **Total** | **46 test files** | ~340 test cases (estimated from last CI run: 342 passing) |

Coverage: `vitest run --coverage` in CI. Threshold: `--passWithNoTests` (no hard floor set yet — add a floor in §6).

### 1.2 E2E (Playwright)

| Category | Specs | Surfaces covered |
|---|---|---|
| Smoke | `smoke.spec.ts` | Chromium, WebKit (iPad Pro 11), Desktop Safari |
| Auth | `auth.spec.ts` | All 3 projects |
| D-pad: dock | `dock-nav.spec.ts`, `dock-nav-auto-prime.spec.ts` | All 3 |
| D-pad: routes | `live-route-dpad.spec.ts`, `movies-route-dpad.spec.ts`, `series-route-dpad.spec.ts`, `search-route-dpad.spec.ts`, `settings-route-dpad.spec.ts` | All 3 |
| D-pad: player | `player-dpad.spec.ts` | All 3 |
| Player smoke | `player-smoke.spec.ts` | Skipped in CI (real stream needed) |
| Routing | `routing.spec.ts` | All 3 |
| Favorites | `favorites-flow.spec.ts`, `favorites-smoke.spec.ts` | All 3 |
| Silk probe | `silk-probe.spec.ts` | WebKit |
| Accessibility | `axe-primitives.spec.ts` | Chromium (axe-core wcag2aa) |
| Visual polish | `visual-polish.spec.ts` | Chromium only (5 route baselines) |
| **Total** | **18 spec files** | Chromium + WebKit (Silk proxy) + Desktop Safari |

Prod-facing: `tests/prod/` has 5 spec files (login, movies, series, search, settings) run via `npm run test:e2e:prod` — separate `playwright.prod.config.ts`.

Perf: `tests/perf/` has 4 spec files (dock-transitions, card-to-detail, back-navigation, grid-scroll).

### 1.3 CI Pipeline

| Job | Runtime (estimated) | Triggered |
|---|---|---|
| Lint + unit + bundle budget | ~3 min | Every PR push + main push |
| Playwright E2E (Chromium + WebKit, 1 worker) | ~8–10 min | After unit job, same triggers |
| **Total per PR** | **~12–13 min** | Well within 15-min cap |

Current Playwright projects: `chromium` (Desktop Chrome), `webkit` (iPad Pro 11), `webkit-desktop` (Desktop Safari). No mobile-viewport emulation project exists yet.

---

## 2. Test Matrix

Legend: **S** = smoke only (≤3 tests: page loads, nav works, no console errors) | **F** = full suite (all flows) | **–** = skipped + rationale noted | **N** = not yet implemented (gap)

### 2.1 Surfaces × Pages

| Surface (Playwright project) | Live | Movies | Series | Series Detail | Search | Favorites | Settings | Player |
|---|---|---|---|---|---|---|---|---|
| **TV emul (WebKit iPad Pro 11)** | **F** | **F** | **F** | **F** | **F** | **F** | **F** | **F** |
| **Desktop (Chromium)** | **F** | **F** | **F** | **F** | **F** | **F** | **F** | **F** |
| **Desktop Safari (webkit-desktop)** | **S** | **S** | **S** | **S** | **S** | **S** | **S** | **S** |
| **Mobile portrait (new project)** | **F** | **F** | **F** | **F** | **F** | **N** | **S** | **S** |
| **Mobile landscape (new project)** | **S** | **S** | **S** | **–** | **–** | **–** | **–** | **S** |
| **Tablet (new project)** | **S** | **S** | **S** | **S** | **S** | **–** | **–** | **S** |

**Rationale notes:**
- Desktop Safari: smoke only — layout engine is same WebKit as TV emul (iPad Pro 11) which gets full suite; duplicate full-suite adds 3+ min for marginal gain.
- Mobile landscape: smoke only — this is a viewport orientation variant; full suite is covered by portrait.
- Tablet Favorites: skipped — Favorites is a grid clone of Movies; grid behavior covered on Mobile portrait.
- Tablet Settings: skipped — Settings settings has no layout difference on Tablet vs Desktop; covered by Desktop full suite.
- Mobile landscape Series Detail / Search / Favorites / Settings: skipped — detail pages are vertical-only on portrait; landscape rotates a working page and is not a new layout tier.

### 2.2 New Playwright Projects to Add

Add to `playwright.config.ts`:

```typescript
{
  name: "mobile-portrait",
  use: { ...devices["Pixel 5"] },          // 393×851, touch, coarse pointer
},
{
  name: "mobile-landscape",
  use: { ...devices["Pixel 5 landscape"] }, // 851×393
},
{
  name: "tablet",
  use: { ...devices["iPad Mini"] },         // 768×1024, touch
},
```

These run only the specs tagged `@adaptive` to keep CI under 15 min. Existing untagged specs continue to run on the existing 3 projects.

**Runtime estimate after additions:**
- New mobile portrait full + tablet smoke: ~4 min additional
- Total per PR: ~13–14 min — still within 15-min gate.

---

## 3. Gesture E2E Coverage

### 3.1 Playwright Touch Model Constraints

Playwright supports single-touch via `page.touchscreen.tap()` and `page.touchscreen.move()` / `touchscreen.tap()`. It does **not** support multi-touch (two simultaneous contacts). Consequences:

- Pinch-to-fullscreen (G8) — **untestable via Playwright multi-touch**. Gate: keyboard `f` shortcut + button click tested instead. Multi-touch pinch must be user-validated on real device (see §10).
- Two-finger tap (G10) — not implemented in MVP; reserved slot; no test needed.
- All single-touch gestures (G1–G7, G9) — testable via `touchscreen` API + manual JS dispatch.

### 3.2 Gesture Test Approach Per Gesture

| Gesture | ID | Playwright Approach | Test File (target) |
|---|---|---|---|
| Single tap — toggle controls | G1 | `page.touchscreen.tap(cx, cy)` on player area; assert `player-controls` visible/hidden. Two taps with 400ms gap → assert hidden again. | `tests/e2e/player-gestures-touch.spec.ts` |
| Double-tap left — seek back | G2 | Two rapid `touchscreen.tap()` calls at x=15%, y=50% within 300ms; assert seek event dispatched (spy on `video.currentTime`). Rate accelerator: 3 taps in 900ms → assert 30s step. | same |
| Double-tap right — seek forward | G3 | Mirror of G2 at x=85%, y=50%. | same |
| Horizontal drag — scrub | G4 | `page.evaluate` injects `TouchEvent` sequence: `touchstart` at (50%, 60%), `touchmove` +60px X over 100ms, `touchend`. Assert `video.currentTime` changed and timestamp badge appears. | same |
| Vertical drag right edge — volume | G5 | `page.evaluate` injects touchstart at (90%, 40%) → touchmove −50px Y → touchend. Opt-in must be enabled first. Assert volume indicator visible. | `tests/e2e/player-gestures-edge.spec.ts` |
| Vertical drag left edge — brightness | G6 | Mirror of G5. Assert `filter: brightness(...)` on video element changed. | same |
| Long-press 2x speed | G7 | `page.evaluate` injects `touchstart`; call `vitest.useFakeTimers()` equivalent (Playwright: inject `Date.now` mock via `addInitScript`); advance 600ms; assert `video.playbackRate === 2`. `touchend` → assert `playbackRate === 1`. | same |
| Pinch fullscreen | G8 | **NOT testable multi-touch.** Test keyboard `f` key path instead: assert `document.fullscreenElement !== null` (or CSS class change if `requestFullscreen` is mocked). | `tests/e2e/player-keyboard.spec.ts` |
| Swipe down — close fullscreen | G9 | `page.evaluate` injects `touchstart` at (50%, 15%), `touchmove` +150px Y at velocity > 300px/s (timestamps embedded), `touchend`. Assert player-shell hidden or fullscreen exited. | `tests/e2e/player-gestures-touch.spec.ts` |

**Important caveat:** All `TouchEvent`-dispatch tests run in Chromium with `hasTouch: true` in device config. They validate the gesture-recognizer logic in `usePlayerGestures.ts` (unit-testable) and the resulting DOM changes. They do not validate WebKit touch event behavior on real iOS Safari. That remains a physical-device gap (§10).

### 3.3 Unit Tests for Gesture Recognizers

`src/player/usePlayerGestures.ts` logic should be covered by Vitest unit tests (not Playwright) for:
- Double-tap timing boundary (399ms → fires; 401ms → no-op)
- Tap position zones (left 35% / right 35% / center 30%)
- Scrub angle threshold (deltaX/deltaY ratio)
- Long-press cancel on movement > 8px
- Swipe velocity threshold at touchend

These are deterministic with mocked timestamps — unit tests are faster and more reliable than E2E for recognizer math.

---

## 4. Visual Regression Strategy

### 4.1 Baseline Coverage Per Surface

| Route | Chromium Desktop | Mobile Portrait | Tablet | Notes |
|---|---|---|---|---|
| `/live` | **baseline** | **baseline** | **baseline** | Channel list layout differs per surface |
| `/movies` | **baseline** | **baseline** | **baseline** | Grid column count changes |
| `/series` | **baseline** | **baseline** | **baseline** | |
| `/series/:id` | **baseline** | **baseline** | skip | Detail page layout differs TV vs mobile; tablet=same as desktop |
| `/search` | **baseline** | **baseline** | skip | Mobile overlay variant is unique |
| `/favorites` | **baseline** | skip | skip | Same grid as movies; no unique layout |
| `/settings` | **baseline** | **baseline** | skip | Accordion vs 2-column layout differs |
| Player open | **baseline** | **baseline** | skip | Controls layout differs; tablet=desktop |
| TV emul | Existing 5 baselines kept | — | — | No new TV baselines needed |

Total new baselines: ~14 (on top of existing 5 TV chromium baselines).

### 4.2 Volatile Element Handling

| Element | Strategy |
|---|---|
| Live EPG times (current/next programme) | `page.evaluate(() => document.querySelectorAll('[data-testid="epg-time"]').forEach(el => el.textContent = "00:00"))` before screenshot |
| Live "● LIVE" badge pulse animation | `await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0ms !important; transition-duration: 0ms !important; }' })` |
| Skeleton loading states | `await page.waitForLoadState("networkidle")` then screenshot (skeletons should resolve or remain stable) |
| Video poster art (may differ by API response) | Mock API returns fixed asset URLs via `XTREAM_MOCK=true`; poster URLs are deterministic |
| Clock/timestamp in player | Freeze `video.currentTime` at 0 via `page.evaluate(() => Object.defineProperty(HTMLVideoElement.prototype, 'currentTime', { get: () => 0 }))` before screenshot |
| Progress bars (watch history) | Seeded data with fixed progress values in E2E user seed |

### 4.3 Tolerance Thresholds

| Context | `maxDiffPixelRatio` | Rationale |
|---|---|---|
| Static UI (settings, empty search) | `0.01` (1%) | Strict — no dynamic content |
| Content pages (movies, series grid) | `0.02` (2%) | Allows minor anti-aliasing differences per browser |
| Player controls | `0.02` (2%) | Controls are overlaid on black; minor sub-pixel variation |
| Live (with EPG) | `0.03` (3%) | EPG text may have minor font rendering diffs across OS |

Run baselines with `npx playwright test --update-snapshots` on the same OS/platform as CI (ubuntu-latest). Commit baselines to `tests/e2e/snapshots/` and `tests/e2e/snapshots-mobile/`.

---

## 5. Accessibility Gates

### 5.1 axe-core in CI

Existing: `axe-primitives.spec.ts` — WCAG 2.1 AA, 0 violations on `/test-primitives`.

**New gates to add** in `tests/e2e/axe-pages.spec.ts`:

```typescript
// For each critical page, run AxeBuilder with wcag2a + wcag2aa + wcag21aa
const CRITICAL_PAGES = ["/live", "/movies", "/series", "/search", "/settings"];
// Run in authenticated state (seedFakeAuth). Assert violations.length === 0.
// Tag: @a11y so it can be targeted separately.
```

**Scope:** WCAG 2.1 AA. Critical pages: all 5 above. Player page is exempt from full-page axe scan (video element triggers known false positives in axe-core; player-specific ARIA is tested separately via role/attribute assertions in player E2E specs).

**Violations expected at zero:** all wcag2a and wcag2aa rules. Exceptions require explicit `.disableRules(['rule-id'])` with a comment citing the known-false-positive or accepted-limitation reason.

### 5.2 Keyboard-Only Navigation E2E

Add `tests/e2e/keyboard-nav.spec.ts`:

| Test | Steps | Assert |
|---|---|---|
| Tab through top nav (Desktop) | `page.keyboard.press('Tab')` × N | Each nav item receives focus in order (Movies → Series → Live → Search → Settings) |
| Enter activates nav item | Focus on Movies link, `Enter` | URL changes to `/movies` |
| Tab into content grid | Tab from nav → first card | First card receives focus, visible focus ring |
| Escape closes player | Open player, `Escape` | Player hidden |
| Arrow keys in scrubber | Focus scrubber `<input type="range">`, `ArrowRight` | `aria-valuenow` increments |
| Audio popover keyboard | Open audio popover, `ArrowDown`, `Enter` | Track selected, popover closes |

All keyboard nav tests run on Chromium Desktop only (norigin disabled, native tab order active on non-TV).

### 5.3 Reduced-Motion Gate

In `axe-pages.spec.ts`, add a parallel run with `prefers-reduced-motion: reduce` via:

```typescript
const context = await browser.newContext({ reducedMotion: 'reduce' });
```

Assert: no animations remain on animated elements (check `getComputedStyle(el).animationDuration === '0s'` for elements with `gesture-ripple` and `player-controls` classes).

---

## 6. Performance Gates

### 6.1 Bundle Budget (CI-enforced)

Current: `scripts/check-bundle-budget.js` — total JS gzip ≤ 600 KB (Phase 3 cap).

**New per-chunk rules to add** for adaptive work:

| Chunk | Limit (gzip) | Rationale |
|---|---|---|
| Initial TV bundle (non-player, non-adaptive) | ≤ 240 KB | +30 KB headroom over current ~213 KB (arch plan §budget) |
| Player chunk (hls.js + player code) | ≤ 200 KB | Existing Phase 5a target |
| Mobile adaptive additions (`inputMode.ts`, `usePlayerGestures.ts`, breakpoint tokens) | ≤ 30 KB incremental | Spec §budget constraint |
| Total all JS | ≤ 600 KB | Existing Phase 3 cap preserved |

Enforcement: extend `check-bundle-budget.js` to check the manifest for chunk names containing `player`/`hls` separately from the initial chunk.

**Coverage floor:** Add `--coverage.thresholds` to `vitest.config.ts` once adaptive files land:
- Lines: 70%
- Branches: 65%
- Functions: 70%

(Gesture recognizer math is safety-critical; unit coverage for `usePlayerGestures.ts` must be ≥ 90% branches.)

### 6.2 Lighthouse Thresholds Per Surface

Run via `npm run perf:lh` (existing `tests/perf/lighthouse-routes.mjs`) against prod/preview:

| Surface | LCP | TBT | CLS | TTI |
|---|---|---|---|---|
| TV (6× CPU, Slow 4G) | < 4000ms | < 600ms | < 0.25 | < 8s |
| Desktop (no throttle) | < 2500ms | < 200ms | < 0.1 | < 5s |
| Mobile (4× CPU, Slow 4G) | < 4000ms | < 600ms | < 0.25 | < 10s |

These are CI-advisory (log to perf-report.md via `build-perf-report.mjs`) not CI-blocking, because Lighthouse results are noisy in shared CI runners. They become blocking only on the scheduled weekly `perf:prod` run against prod.

**CI-blocking perf gate (per PR):** only the bundle budget check. Lighthouse is non-blocking in PR CI.

### 6.3 Transition Budget (Playwright perf suite)

Existing perf specs (`tests/perf/`) measure dock transitions, card→detail, back navigation, grid scroll. No changes needed — they already catch regressions introduced by adaptive layout work. Add one new spec:

**`tests/perf/input-mode-transition.spec.ts`:** Measure cost of `data-input-mode` attribute change (triggers CSS selector re-evaluation). Should be < 16ms (1 frame at 60fps). Assert via `performance.measure`.

---

## 7. Per-PR Gates

### 7.1 Gate Sequence (must all pass for merge)

```
1. lint (ESLint --max-warnings 0)
2. typecheck (tsc --noEmit)
3. vitest (all 46+ unit files, coverage ≥ floor)
4. bundle budget (check-bundle-budget.js)
5. playwright E2E:
   a. Existing projects (chromium, webkit, webkit-desktop) — full suite
   b. New adaptive projects (mobile-portrait, mobile-landscape, tablet) — @adaptive tagged tests only
6. axe-core gate (axe-pages.spec.ts + axe-primitives.spec.ts — 0 violations)
7. visual regression (visual-polish.spec.ts + adaptive visual baselines — 0 unintentional diffs)
8. keyboard-nav E2E (keyboard-nav.spec.ts — Desktop only)
```

### 7.2 Code Review Requirements

- `security-review` skill must run on every PR that touches auth, API client, or player URL handling.
- `review` skill (code-review agent) runs on all PRs.
- At least one human reviewer approval required before merge.
- Auto-merge ONLY if: all 8 gate steps above are green + human approval + no "changes requested" review state.

### 7.3 TV Non-Regression Gate (mandatory on every adaptive PR)

Before merge, CI must pass the following existing specs unchanged:
- `silk-probe.spec.ts` — UA detection
- `dock-nav.spec.ts` + `dock-nav-auto-prime.spec.ts` — d-pad dock
- `live-route-dpad.spec.ts`, `movies-route-dpad.spec.ts`, `series-route-dpad.spec.ts` — d-pad routes
- `player-dpad.spec.ts` — player D-pad

Any regression in these specs blocks the adaptive PR regardless of whether the failing code is in a "separate" code path.

---

## 8. Pre-Deploy Smoke

Run as part of `bin/streamvault-deploy.sh` (§4 of `04-rollback-and-flags.md`) after the Docker build completes, before marking `smoke_passed: true`.

### 8.1 Smoke Script (`bin/streamvault-smoke.sh`)

Steps run against `http://localhost:3006` (internal direct, no TLS/cache):

```
1. GET /           → HTTP 200 + body contains "StreamVault"
2. GET /api/health → HTTP 200 + {"status":"ok"}
3. Auth smoke:
   POST /api/auth/login {username: $E2E_USER, password: $E2E_PASS} → 200 + access_token present
4. GET /live (with auth header) → 200
5. Playwright headless smoke (1 worker, timeout 60s):
   npx playwright test tests/e2e/smoke.spec.ts --config playwright.prod.config.ts
   Assertions: homepage loads, login redirects correctly, /live and /movies load
6. Feature-flag endpoint:
   GET /api/flags (or equivalent) → 200 + JSON response (any flags value)
```

Failure on any step → exit 1 → `bin/streamvault-deploy.sh` triggers `streamvault-rollback.sh`.

Timeout for full smoke: 90 seconds. If exceeded, treat as failure.

---

## 9. Post-Deploy Validation

Read-only checks against `https://streamvault.srinivaskotha.uk` (prod), run 2 minutes after deploy completes (allow CDN/DNS propagation):

### 9.1 Checks

```
1. HTTPS 200 on /            (curl -sf --max-time 10)
2. HTTPS 200 on /api/health
3. No JavaScript errors on homepage load:
   Playwright: page.on('pageerror') should fire 0 errors during 10s idle on /movies
4. Feature-flag manifest reachable:
   GET /api/flags → 200 (confirms admin endpoints live)
5. Rollback manifest written:
   Confirm /home/crawler/snapshots/{DEPLOY_ID}.manifest.json exists with smoke_passed: true
6. Adaptive breakpoint token present:
   Playwright: page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gutter-content'))
   → non-empty string (confirms new token CSS shipped)
```

### 9.2 Failure Response

Any post-deploy check failing:
1. Fire PushNotification (if configured) or write to deploy log.
2. Operator reviews rollback log.
3. Manual decision to rollback via `bin/streamvault-rollback.sh <last-good-deploy-id>`.

Post-deploy checks are advisory (non-automated rollback) because prod checks can have transient failures unrelated to the deploy (CDN flap, network timeout). Smoke (§8) is the automated rollback trigger; post-deploy is the operator health-check.

---

## 10. Physical-Device Gap (Lab-Only, Awaits User Real-Device Validation)

The following behaviors are **not testable in CI** and require user validation on real hardware:

| Gap | Why CI cannot test | Real device needed |
|---|---|---|
| Fire TV remote D-pad feel | Playwright keyboard emulation is instantaneous; real remote has debounce, key-repeat rate, and button-hold auto-repeat behavior | Fire TV Stick 4K Max with real remote |
| Fire TV Silk WebKit rendering | Playwright WebKit (iPad Pro 11) is a proxy; Silk has custom UA overrides and rendering quirks | Fire TV Stick with Silk browser |
| iPhone touch latency | Playwright `touchscreen.tap()` is synthetic with no network or OS touch-processing latency | iPhone (any model, iOS ≥ 16) |
| iOS Safari fullscreen API | `requestFullscreen()` on iOS Safari requires a user-gesture context; emulated touch events are not always treated as user gestures | iPhone running Safari |
| iOS WebKit gesture conflict (pinch vs browser zoom) | Cannot simulate 2-finger touch in Playwright | iPhone |
| Android Chrome touch response | Pixel 5 emulation in Playwright is a Chromium UA + viewport; no real Android touch pipeline | Android phone (Pixel or Samsung) |
| G5/G6 edge-drag volume/brightness | Playwright evaluates touch events correctly but screen-edge safe-area insets differ per physical device model | iPhone notch model + Android edge-gesture model |
| `prefers-reduced-motion` system setting | Playwright `reducedMotion: 'reduce'` tests CSS; cannot verify OS-level animation system interacts correctly | Any physical device in accessibility mode |
| HDR/wide-gamut color rendering | `--accent-copper` #C87941 rendering on OLED vs LCD displays | Fire TV (OLED), iPhone Pro, Samsung AMOLED |
| Bluetooth / RF interference on remote | D-pad input events can stutter on congested 2.4GHz | Real home Wi-Fi + Fire TV environment |

**Validation protocol:** User runs the following checklist on each real device before declaring a phase complete:
1. Open app on device. Confirm dock renders correctly (bottom pill on TV, bottom bar on mobile).
2. Navigate Movies → tap/click a card → player opens.
3. Tap center of player (mobile) → controls appear. Tap again → controls hide.
4. Double-tap left zone → confirm seek back ripple.
5. Double-tap right zone → confirm seek forward ripple.
6. Long-press player → confirm 2x badge appears, releases on lift.
7. Swipe down from top of player (mobile fullscreen) → player closes.
8. Open Settings, verify swipe-gesture toggle present and functional.
9. Check keyboard nav (Tab through Desktop top nav).
10. Confirm no console errors visible in browser DevTools.

---

## 11. Definition of Done

### Phase Complete Criteria (adaptive layer, per release)

A phase is **Done** when ALL of the following are true:

```
[ ] All P0 user stories for the phase have Playwright E2E tests that pass on
    chromium + mobile-portrait projects.

[ ] Visual regression: 0 unintentional diffs across all baseline-covered routes
    and surfaces (§4.1). Any intentional diff has an --update-snapshots commit
    with reviewer sign-off explaining the change.

[ ] axe-core: 0 violations on all 5 critical pages (Live, Movies, Series, Search,
    Settings) on both Desktop (Chromium) and Mobile Portrait (Pixel 5) projects.

[ ] Bundle budget: TV initial chunk ≤ 240 KB gz; Player chunk ≤ 200 KB gz;
    total JS ≤ 600 KB gz. Verified by check-bundle-budget.js in CI.

[ ] TV non-regression: all 7 existing D-pad Playwright specs green (silk-probe,
    dock-nav, dock-nav-auto-prime, live/movies/series-route-dpad, player-dpad).

[ ] Keyboard nav: keyboard-nav.spec.ts passes on Chromium Desktop.

[ ] Gesture unit tests: usePlayerGestures.ts branch coverage ≥ 90% in vitest.

[ ] Pre-deploy smoke: bin/streamvault-smoke.sh exits 0 on preview stack.

[ ] Rollback drill: at least one successful drill (§7 of 04-rollback-and-flags.md)
    executed for the phase. Log at /home/crawler/snapshots/drill-YYYYMMDD.log.

[ ] Physical-device gap acknowledged: status report written listing which items
    in §10 have been user-validated and which remain open.

[ ] Status report written: brief Markdown note in .claude/plans/v3-adaptive/
    covering what shipped, what CI reported, what is lab-only pending validation.
```

### Rollback Readiness (required before any production deploy of adaptive work)

```
[ ] Snapshot captured for current prod state (smoke_passed: true manifest exists).
[ ] bin/streamvault-rollback.sh tested on preview stack (not prod) and exits 0.
[ ] Rollback time measured: target ≤ 5 minutes end-to-end.
```

---

## Appendix A: Test File Locations (to be created for adaptive work)

| File | Purpose |
|---|---|
| `tests/e2e/player-gestures-touch.spec.ts` | G1–G4, G7, G9 single-touch gesture E2E |
| `tests/e2e/player-gestures-edge.spec.ts` | G5–G6 edge-drag volume/brightness |
| `tests/e2e/player-keyboard.spec.ts` | G8 (keyboard path), all keyboard shortcuts |
| `tests/e2e/keyboard-nav.spec.ts` | Tab order, desktop top nav, scrubber keyboard |
| `tests/e2e/axe-pages.spec.ts` | axe-core 0-violations gate for 5 critical pages |
| `tests/e2e/adaptive-visual.spec.ts` | Visual baselines for mobile-portrait + tablet |
| `tests/e2e/input-mode.spec.ts` | `data-input-mode` transitions on mousemove/touchstart/keydown |
| `tests/perf/input-mode-transition.spec.ts` | Cost of attribute flip < 16ms |

---

## Appendix B: CI Workflow Changes Required

1. Add `mobile-portrait`, `mobile-landscape`, `tablet` projects to `playwright.config.ts`.
2. Update `ci.yml` to install Playwright browsers for these projects (same `npx playwright install chromium webkit` already covers them — Pixel 5 uses Chromium, iPad Mini uses WebKit).
3. Add `@adaptive` tag check: `npx playwright test --grep @adaptive` for new projects.
4. Add coverage thresholds to `vitest.config.ts` once adaptive files land (§6.1).
5. Extend `check-bundle-budget.js` with per-chunk rules (§6.1).
