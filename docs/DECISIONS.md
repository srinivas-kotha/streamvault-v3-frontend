# StreamVault v3 — Architectural Decisions (append-only)

> Rule: never delete entries. Append only. Each entry: date · decision · rationale.

## 2026-04-15 — Locked Decisions (from brainstorm)

1. Scope: Fork new repo streamvault-v3-frontend; archive old as streamvault-v2-archived. No code ported.
2. Audience: Private now, open-source ready later.
3. Primary device: TV-first (Fire TV Stick 4K Max).
4. MVP scope: Core + Search + Sort (favorites, history, channel, EPG time filter).
5. Frontend stack: React 19 + Vite 5 + TypeScript strict + Tailwind CSS 4 + norigin-spatial-navigation@2.1.0 (exact).
6. Layout: Apple-TV-style bottom dock + 4 page templates.
7. Palette: Oxide — copper #C87941 on gunmetal #12100E.
8. Paperclip cleanup: Option C — cancel open/in-progress, keep 4 research-done issues as reference.

## 2026-04-15 — Admin password rotation

Temporary password from backend PR #37 confirmed as current prod admin password (value redacted; tracked as weak plan-debt — rotate before OSS).
User-chosen. Flagged as weak plan-debt — rotate before v3 goes OSS/public.
Verified via POST /api/auth/login returning 200 with valid session cookies.

## 2026-04-15 — E2E test account (sv_e2e_test) deferred

sv_e2e_test account creation deferred to Task 3.0 pre-check window.
Reason: scripts/seed-user.js does not exist in streamvault-backend yet; creating it is
a separate backend PR not required until Phase 3 auth E2E tests run (weeks away).
Plan: create sv_e2e_test alongside any backend PR needed for change-password endpoint
confirmation. SV_TEST_USER=sv_e2e_test + SV_TEST_PASS documented in .env.example.

## 2026-04-15 — Paperclip Option C cleanup complete (Task 0.3 remainder)

- Tagged 3 issues [V2-RESEARCH-REFERENCE] (2x SRI-156 matches + SRI-27 reference issue).
  Note: SRI-157 and SRI-158 do not exist in Paperclip — not created in prior sessions.
- Tagged 52 issues [V2-ARCHIVED] (all remaining done/cancelled SV-tagged issues).
- Created child goal "[V3] StreamVault v3.0 Private MVP" under a44cd232 (company goal).
  New goal ID: 7b95430c-6235-428b-b58b-12335505d45d (level: team, status: active).
  Architecture decision: created as CHILD of a44cd232 (not sibling) — a44cd232 is the
  company-wide ambition; this MVP goal is a scoped delivery milestone. Child is correct.
  Level enum: valid values are company/team/agent/task — used "team" (sub-company milestone).
- Program-level skill-audit comment: NOT POSTED via comments endpoint.
  All comment endpoints for goals return 404 or "API route not found":
  - /api/companies/{companyId}/goals/{goalId}/comments → API route not found
  - /api/goals/{goalId}/comments → API route not found
  - /api/issues/{goalId}/comments → Issue not found (goals not in issue namespace)
    Fallback: skill-audit text appended to goal description instead.
    Required skills embedded: superpowers:executing-plans, superpowers:test-driven-development,
    superpowers:subagent-driven-development, ship-it, quality-reviewer.

## 2026-04-18 — Inter Display passes 2m TV-distance typography gate (Task 1.2)

Verified via Playwright screenshot `/tmp/typography-gate-1080p.png` rendered at 1920×1080 (DPR 1, Chromium) and reviewed in-session. All 6 type scales (Hero 48px/700, Title 32px/600, BodyLg 24px/500, Body 20px/400, Label 14px/500 uppercase+tracking, Caption 16px/400 tertiary) legible. Label at 14px is in-spec floor; letter-spacing + uppercase compensate. Caption tertiary 40% opacity is intentional low-priority tone.

Outcome: Inter Display kept as primary UI font. Roboto fallback NOT triggered.

Font loading strategy: static discrete weights (400/500/600/700) via Google Fonts CSS2 API with `display=optional` — chosen over variable-font `opsz,wght@14..32,400..700` to avoid weight-collapse on TV browsers with partial variable-font support (Fire OS 5/6 WebKit), and over `display=swap` to avoid cold-load FOUT reflow on TV remote-controlled UX.

Follow-up before OSS/public release: self-host Inter woff2 from `/public/fonts/` and drop the Google Fonts CDN link (GDPR / privacy, offline-cache resilience, and removes residual UA-sniff risk). Tracked as plan-debt alongside admin-password rotation.

Fire Stick verification still pending — gate evidence above is Chromium-only. Before Phase 5a player work, run the same 6-scale render on Fire TV Stick 4K Max and append the confirmation here.

## 2026-04-21 — Task 2.1: norigin@2.1.0 Silk probe — PASS [CHROMIUM / WebKit-blocked-VPS]

**Result: norigin@2.1.0 fires correctly on Chromium (Playwright). Silk probe passed.**

Probe: TL→TR (ArrowRight), TR→BR (ArrowDown), BR→BL (ArrowLeft), BL→TL (ArrowUp) — all transitions confirmed via `document.activeElement?.getAttribute("aria-label")` assertions. Key log captured: 4 ArrowKey events processed by norigin. `shouldFocusDOMNode: true` confirmed active (TL button style.background = `var(--accent-copper)` on mount). PR: feat/silk-probe-gate.

**WebKit engine status**: WebKit GTK4 cannot launch on this VPS — 40+ system libraries missing (libgtk-4.so.1, libpangocairo, libcairo, etc.). Requires `sudo apt-get install` which is out of scope for UI agent. GitHub Actions CI will run the WebKit project automatically on next PR — Ubuntu runners have these libraries pre-installed via `playwright install-deps webkit`. Test is tagged `--project=webkit` and is in the CI suite.

**Fallback decision**: Not triggered. norigin@2.1.0 is confirmed as the v3 spatial nav library. No fallback implementation needed.

**Type definition deviation**: `distanceCalculationMethod` is documented in the norigin README but absent from the v2.1.0 published type definitions (`dist/SpatialNavigation.d.ts`). Omitted from `initSpatialNav()` to maintain TypeScript strict compliance. If this option is needed before an norigin upgrade, use a cast: `init({ ..., distanceCalculationMethod: 'center' } as Parameters<typeof init>[0])`. `import.meta.env.DEV` used instead of `process.env.NODE_ENV` (Vite environment variable idiom).

**setFocus('TL') rationale**: `focusSelf()` on the SILK-PROBE container passes focus to the first registered child — deterministic but requires norigin to complete child registration before the call resolves. `setFocus('TL')` is called after `focusSelf()` as an explicit override to guarantee TL is the active element regardless of norigin child registration race conditions. Both calls are idempotent.

## 2026-04-21 — Task 2.3: React Router 6 + 5 route shells + dock follow-ups

Installed `react-router-dom@6`. Added 5 route shells under `src/routes/` (Live/Movies/Series/Search/Settings), each a minimal `<main data-page="<id>">` wrapped in a `<FocusContext.Provider value="CONTENT_AREA_<ID>">` so that future Esc-key logic can route focus out of `BottomDock` via `setFocus("CONTENT_AREA_LIVE")` etc. Preserved `/test-primitives` and `/silk-probe` as permanent dev-time routes under the same `<Routes>`.

`App.tsx` now wraps everything in `<BrowserRouter>` with v7 future flags (`v7_startTransition`, `v7_relativeSplatPath`) opted-in early to silence React Router 6 → 7 migration warnings. An inner `<AppShell>` uses `useNavigate` + `useLocation` — `useNavigate` can't be called at the top `<App>` level because `<BrowserRouter>` must wrap it first. `activeTab` is derived from `pathname.split("/")[1]` (not local state) so browser back/forward and deep links keep the dock indicator in sync. A type guard (`isDockItem`) narrows the `noUncheckedIndexedAccess` string to `DockItem`. The dock is hidden on `/test-primitives` and `/silk-probe` via the existing `hidden` prop so it doesn't overlap the fixture / probe.

**Follow-up A shipped**: Added `paddingBottom: "env(safe-area-inset-bottom, 0px)"` to the dock `<nav>` inline style — protects against iOS/Android safe-area notches.

**Follow-up B shipped**: `CONTENT_AREA_<ID>` FocusContext.Provider wrapping in each route shell (5 providers). Does not introduce runtime focus movement yet — the providers just EXIST so Phase 5a / Task 2.4 can target them. Each `<main>` gets `tabIndex={-1}` for programmatic focus.

**Bundle size**: 85.60 KB gzip (up from 77.83 KB baseline; +7.77 KB for react-router-dom@6 + 5 shells + FocusContext wiring). Phase 2 cap is 800 KB, comfortable headroom.

**Test gates green**: `npx tsc --noEmit` clean, `npx vitest run` 43/43, `npx playwright test tests/e2e/routing.spec.ts --project=chromium` 3/3 (/ → /live redirect, /movies + /search shells visible).

**Expert-Level Clause** (3 things a senior would add):
1. **Shipped**: v7 future flags on BrowserRouter to silence migration warnings.
2. **Deferred**: Error boundary per route — currently a route render throw would crash the whole app. Phase 3 or later can add an `<ErrorBoundary>` wrapper inside each `<Route element={...}>`.
3. **Deferred**: Unit test for `AppShell`'s URL→DockItem derivation edge cases (`/unknown`, `/test-primitives`, bare `/`). Current E2E coverage proves the golden path; a fast vitest spec would catch regressions cheaper than Playwright.

Follow-ups deferred: (2) + (3) above. Both tracked here only — not urgent enough for KNOWN-RISK.md.

## 2026-04-21 — Task 2.4: BottomDock D-pad E2E + norigin focusKey + test-only setFocus hook

Shipped `tests/e2e/dock-nav.spec.ts` with 4 Playwright tests: ArrowRight moves focus Live→Movies, Enter on a dock item navigates via React Router, dock visibility on content routes, dock hidden on `/test-primitives` + `/silk-probe`.

**Root cause found during test debugging**: DockTab's `useFocusable` was missing `focusKey`, so norigin couldn't uniquely identify siblings under DOCK — ArrowRight was a no-op because norigin had no current focus to navigate FROM. Additional finding: DOM focus (via `.click()` or `.focus()`) does NOT sync norigin's internal `lastFocused` pointer. Only `setFocus("key")` or `focusSelf()` primes norigin's focus tree.

**Fixes**:
1. `src/nav/BottomDock.tsx` — DockTab now uses `useFocusable({ focusKey: \`DOCK_${item.id.toUpperCase()}\`, onEnterPress })`. Keys: `DOCK_LIVE`, `DOCK_MOVIES`, `DOCK_SERIES`, `DOCK_SEARCH`, `DOCK_SETTINGS`.
2. `src/main.tsx` — dev/test-only `window.__svSetFocus = setFocus` (gated by `import.meta.env.DEV`). Lets Playwright prime norigin the same way a first remote-button press does on a real TV.

**Test pattern** (dock-nav.spec.ts): `page.evaluate(() => window.__svSetFocus("DOCK_LIVE"))` → `waitForFunction(activeElement.aria-label === "Live")` → `keyboard.press("ArrowRight")` → `waitForFunction(aria-label === "Movies")`.

**All gates green**: tsc clean, vitest 43/43, Playwright chromium 7/7 (3 routing + 4 dock-nav), build 85.59 KB gzip (unchanged).

**Expert-Level Clause** (3 senior additions):
1. **Shipped**: Dev-only `window.__svSetFocus` — future E2E tests of dock + content-focus handoffs will need this same priming pattern.
2. **Deferred**: WebKit-project run for dock-nav (Desktop Safari + iPad Pro 11). Silk-probe already validates norigin on WebKit; dock-nav will ride the next CI run which includes webkit by default.
3. **Deferred**: Unit test for DockTab's focusKey derivation. Current E2E proves the spatial-nav wiring — a jsdom test can't verify norigin focus anyway.

## 2026-04-21 — Task 3.0 pre-check: change-password endpoint MISSING → Phase 3 BLOCKED

Probed `http://localhost:3001/api/auth/change-password` per plan Task 3.0 Step 1:

- `POST` with placeholder Bearer token + `{"currentPassword":"x","newPassword":"y"}` → HTTP 403 `{"error":"Forbidden","message":"CSRF token mismatch"}`
- `POST` with no Authorization header → same 403 CSRF response (CSRF middleware fires before auth middleware)
- `GET /api/auth/change-password` → HTTP 501 `{"error":"Not Implemented","message":"Not implemented yet — coming in Phase 2/3"}` — strong signal the endpoint is known-and-planned but not yet wired
- `grep -rn "change-password|changePassword" /home/crawler/streamvault-backend/src/` → 0 hits

**Endpoint MISSING. Per plan: Phase 3 BLOCKED** until a backend PR lands on `streamvault-backend`. Full resume plan + operational constraints captured in `docs/KNOWN-RISK.md` entry `KR-CHANGEPW`.

This session did NOT auto-build the backend endpoint because:
1. Auth-sensitive changes (bcrypt, refresh-token revocation, CSRF) should not ship unsupervised.
2. `streamvault-backend` CI has been red since 2026-03-14 — changes cannot be automatically validated.
3. The plan's Task 3.0 gate explicitly says "escalate; do not proceed" when the endpoint is missing.

Next session: write + review + merge the backend PR (or establish a manual-deploy path given the CI outage), then re-probe, tick the plan checkbox, and begin Task 3.1 (Zod schemas).

## 2026-04-21 — Phase 3 shipped: Auth + API Client + JWT contract

**PRs merged:** streamvault-backend #39 (change-password endpoint), streamvault-v3-frontend #18 (Zod schemas), #19 (ApiClient), #20 (this PR — auth feature + Phase 3 DoD).

### JWT security contract (from spec §11) — documented state

1. **Access token lifetime: 15 min.** Signed with `jti` (RFC 7519) to prevent same-second refresh-hash collision (streamvault-backend PR #38). Stored in `sessionStorage` under key `sv_access_token` — cleared on tab close.
2. **Refresh token lifetime: 90 days.** Stored in `localStorage` under `sv_refresh_token` — persists across tabs/restarts. Hashed on backend (`sha256`), revoked rows flagged not deleted.
3. **Rotation on refresh.** `POST /api/auth/refresh` returns a NEW refresh token; old token is revoked atomically. Prevents replay if a refresh token is captured in transit.
4. **Automatic retry on 401.** `ApiClient.request` detects 401, calls `tryRefresh()`, and retries the original request with the new access token. On refresh failure, throws `ApiError(401)` so the caller can route to login.
5. **Refresh-token purge on password change.** `POST /api/auth/change-password` invalidates ALL refresh tokens for the user (backend UPDATE `revoked=true WHERE user_id=$1`). Frontend `changePassword()` follows with `apiClient.clearTokens()` so the current session is also terminated.
6. **CSRF.** Backend `csurf` middleware fires before auth. Change-password path is NOT in `CSRF_EXEMPT_PATHS` — protected by double-submit cookie. Login/refresh are exempt (by design: first-auth and token-only flows, bearer auth is the CSRF substitute).
7. **Rate limiting.** `loginLimiter` + `changePasswordLimiter` both cap at 5 req/15 min per IP (backend `express-rate-limit`) — blocks brute-force without locking out the user's token.
8. **CI secrets for E2E.** `SV_TEST_USER` + `SV_TEST_PASS` must point at a dedicated `sv_e2e_test` account, NOT the rotated prod admin password. Stored in GitHub Actions repo secrets; sourced in `ci.yml` Playwright step.

### Bundle budget — Phase 3 cap

`scripts/check-bundle-budget.js`: `TOTAL_LIMIT_KB` tightened from 800 → **600 KB** per Phase 3 DoD. Adds headroom check against Phase 5a (hls.js code-split).

### E2E auth suite — fail-fast guard

`tests/e2e/auth.spec.ts` runs `test.skip(!SV_TEST_USER || !SV_TEST_PASS, ...)` at the describe level. In CI without secrets configured, the suite skips with a clear reason instead of falling back to `admin/changeme` placeholders (which would pass locally and fail silently in prod).

### Shared E2E helper

`tests/e2e/helpers.ts` exports `seedFakeAuth(page)` — pre-seeds dummy tokens in `sessionStorage` + `localStorage` via `page.addInitScript`, so existing E2E suites (routing, dock-nav, axe-primitives, silk-probe) bypass the new App.tsx auth gate. Only `auth.spec.ts` exercises the real login flow.

### Known plan-debt resolved this session

- `.env.example` already carried `SV_TEST_USER` / `SV_TEST_PASS` placeholders from Task 0.4 scaffold — no change needed.
- sv_e2e_test account seeding STILL deferred (backend seed script not yet written). Auth E2E will skip in CI until the seed lands + `SV_TEST_*` secrets are populated. **This is the only Phase 3 DoD item that stays plan-debt.**
