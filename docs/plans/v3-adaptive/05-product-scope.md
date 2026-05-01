# StreamVault v3 Adaptive Responsive — Product Scope (PRD)

**Owner:** Product (auto-generated 2026-04-29)
**Status:** Draft — awaiting user review
**Scope:** Responsive design for Desktop (mouse/keyboard) + Mobile (touch/gestures) layered on the existing TV-first production app.
**Must-not-break:** Fire TV D-pad (norigin), tap-rate seek accelerator (PR #116), events-router catchall ordering (PR #54), 342 existing passing tests.
**Related plans:** `02-fe-architecture.md`, `04-rollback-and-flags.md`, `01-ux-spec.md`

---

## 1. Problem Statement

StreamVault is a self-hosted IPTV platform optimised exclusively for Fire TV Stick 4K (10-foot UI, D-pad navigation). It is live at `streamvault.srinivaskotha.uk`. The owner increasingly watches on a desktop browser and mobile phone, but the app currently degrades to an unusable state on both: the fixed-bottom dock clips off-screen on mobile, no hover or click states exist on any card or control, the player scrubber is an unclickable progress bar, and touch gestures are entirely absent. The goal of this phase is to make the full StreamVault experience — browse, filter, detail, and playback — genuinely usable on desktop and mobile while keeping the Fire TV experience completely unchanged, with a documented rollback mechanism so that a bad deploy can be reversed in under five minutes without data loss.

---

## 2. User Personas

### Persona 1 — TV Viewer (existing, do not regress)

- **Device:** Amazon Fire TV Stick 4K Max + Alexa voice remote
- **Context:** Lean-back couch viewing, 10-foot distance from screen, room lighting variable
- **Primary controls:** D-pad (arrow keys + Enter + Back) via norigin spatial navigation
- **Cares about:** Instant channel switch, 1-press pause/resume, reliable audio-track selection for multilingual content (Telugu/Hindi), resume-point accuracy, no accidental input
- **Success bar:** Every hero task achievable in ≤ 3 D-pad presses from dock. No cognitive overload from desktop affordances appearing on TV.

### Persona 2 — Desktop Browser User (new)

- **Device:** Laptop or desktop computer, mouse + keyboard, modern browser (Chrome/Firefox/Safari)
- **Context:** Sit-close viewing at a desk; may have second-screen content alongside; occasionally uses keyboard shortcuts
- **Primary controls:** Mouse click, hover, drag, keyboard shortcuts (Space = pause, J/K/L = seek, F = fullscreen)
- **Cares about:** Clickable scrubber with seek preview, hover states on cards, recognisable streaming-app navigation (side or top nav — not a mobile bottom dock), keyboard-accessible controls, no focus-ring flash on mouse click
- **Success bar:** Can launch a movie, scrub to 30 minutes via drag, change audio track, and return to browse, all with mouse only in ≤ 10 actions.

### Persona 3 — Mobile Commuter (new)

- **Device:** iPhone or Android phone (portrait + landscape), browser or added-to-home-screen PWA
- **Context:** On the go, cellular or variable Wi-Fi, one-handed use likely, gloves possible, short viewing bursts
- **Primary controls:** Tap, swipe, long-press (YouTube-style gestures); bottom thumb-zone is reachable
- **Cares about:** Tap-anywhere play/pause, swipe-to-seek without entering a tiny scrubber bar, safe-area insets so dock does not clip behind notch, 44px minimum touch targets, no accidental seek when scrolling the browse grid
- **Success bar:** Can start an episode, seek forward 30 seconds with a swipe, and change audio track from a bottom sheet in ≤ 8 taps; app does not crash or mis-navigate on any gesture.

---

## 3. User Stories

### Browse & Navigation

**US-001 — Desktop side navigation**
As a desktop browser user I want a persistent side or top navigation so I can switch between Live, Movies, Series, and Search without looking at a bottom dock positioned for TV use.
_Acceptance criteria:_
- AC1: On `pointer:fine` + `hover:hover` + `min-width: 1024px` and `data-tv` absent, the bottom dock is visually hidden (CSS `display:none`) and a side/top nav renders with all 5 sections.
- AC2: The bottom dock remains mounted in the React tree (norigin focus keys registered) so switching to a connected keyboard does not break D-pad session.
- AC3: Active route is visually indicated in the side nav with the copper accent token.
- AC4: Playwright TV-mode snapshot (Fire TV UA) is pixel-identical before and after this change.

**US-002 — Mobile bottom navigation with safe-area insets**
As a mobile user I want the bottom dock to respect the phone's notch/home-bar area so the nav tabs are not hidden behind the system UI.
_Acceptance criteria:_
- AC1: Dock bottom padding uses `env(safe-area-inset-bottom, 0px)` on `pointer:coarse` devices.
- AC2: On an iPhone 14 Pro screenshot (Playwright viewport 390×844), all 5 dock icons are fully visible above the home indicator zone.
- AC3: TV layout unaffected — `env()` fallback is 0 on TV.

**US-003 — Input-mode context available app-wide**
As a developer I want a stable `useInputMode()` hook that reflects the last active input type (keyboard/mouse/touch) and platform hint (tv/desktop/mobile) so I can gate behaviors without `window.matchMedia` scattered across components.
_Acceptance criteria:_
- AC1: `InputModeProvider` wraps `<App>` at mount.
- AC2: Switching input type (mouse move → key press → touch) updates the context within one event.
- AC3: On TV (UA sniff, `data-tv="true"`), `isTV` is `true` and never changes regardless of mouse/touch events (TV UA is stable).
- AC4: Unit tests cover all 4 detection signals; branch coverage ≥ 80% on `InputModeProvider.tsx`.

**US-004 — Feature flags control adaptive behaviors**
As the operator I want to enable adaptive features per-environment via a backend feature flag so I can deploy adaptive code to prod while keeping it off until manual QA passes.
_Acceptance criteria:_
- AC1: `GET /api/config/flags` returns a JSON flags object; default all adaptive flags to `false` in `sv_settings`.
- AC2: Client caches flags in `localStorage` with a server-provided TTL; falls back to `false` (fail-closed) if endpoint is unreachable within 3 seconds.
- AC3: `VITE_FF_<FLAG_NAME>=true` in `.env.local` overrides any backend value for local dev.
- AC4: Flipping a flag in the DB takes effect within one page refresh (no app restart required).

### Player Gestures

**US-005 — Slide/tap/drag anywhere on the player (mobile)**
As a mobile user I want to swipe horizontally anywhere on the player to seek, tap to toggle controls, double-tap the left/right thirds to jump ±10s, and swipe vertically to change volume, matching YouTube-style gestures.
_Acceptance criteria:_
- AC1: Single tap anywhere on the video area toggles control-bar visibility (show if hidden, start 3s auto-hide if showing); does not trigger play/pause.
- AC2: Horizontal swipe of ≥40px in VOD/Series enters scrub mode; swipe distance maps to seek delta (0–25% screen width = ±10s; 25–60% = ±30s; 60%+ = ±60s); a seek-preview overlay shows the target timestamp during drag and commits on pointer-up.
- AC3: Double-tap on left third = seek -10s with left-pointing ripple; double-tap right third = seek +10s with right-pointing ripple. Double-tap on live streams is a no-op.
- AC4: Vertical swipe on the right half adjusts volume (±5% per 8px of vertical movement); a volume level indicator appears and auto-hides 1.5s after last gesture.
- AC5: Long-press (≥500ms) on the video area enables 2× playback speed for the duration of the press; release restores normal speed.
- AC6: On TV (`isTV = true`), `PlayerGestureLayer` never mounts (hard guard at component top); existing D-pad behavior is bit-identical.
- AC7: Gestures work in both portrait and landscape orientation on iOS Safari and Android Chrome.

**US-006 — Click-to-seek and drag scrubber on desktop**
As a desktop user I want to click anywhere on the scrubber bar to seek to that position, drag the scrub thumb for live feedback, and hover to see a timestamp tooltip above the cursor.
_Acceptance criteria:_
- AC1: `DesktopScrubber` replaces the static `<div role="progressbar">` when `isMouse = true`; the TV `TvScrubber` renders otherwise — zero TV regression.
- AC2: Single click on scrubber bar seeks to clicked position (±1% precision).
- AC3: Drag on the scrub thumb shows live seek-preview at the pointer position and commits on `pointerup` (pointer capture active during drag so cursor leaving the bar does not abort scrub).
- AC4: Hover over scrubber bar expands it from 4px to 8px height and shows a timestamp tooltip above the pointer.
- AC5: Click-to-seek fires `onSeek` through the shared `seekWithRate` path so history + analytics events are identical to D-pad seek.
- AC6: `DesktopScrubber` has `if (isTV) return null` as its first line.

**US-007 — Mouse click-to-play/pause on desktop**
As a desktop user I want a single click anywhere on the video area (outside controls) to toggle play/pause, and a double-click to toggle fullscreen, matching browser-native video conventions.
_Acceptance criteria:_
- AC1: `onClick` on the video area calls `toggle()` unless the click lands on a player control (controls use `stopPropagation`).
- AC2: `onDoubleClick` on the video area requests fullscreen (`document.documentElement.requestFullscreen()`) or exits if already fullscreen.
- AC3: On TV, the `onClick`/`onDoubleClick` handlers are not attached (norigin Enter key handles play/pause).

**US-008 — Keyboard shortcuts on desktop player**
As a desktop user I want standard media keyboard shortcuts so I can control playback without reaching for the mouse.
_Acceptance criteria:_
- AC1: `Space` toggles play/pause when player is focused and no text input is active.
- AC2: `j` = seek -10s, `l` = seek +10s (YouTube convention), `k` = toggle play/pause.
- AC3: `f` = toggle fullscreen.
- AC4: `ArrowLeft` / `ArrowRight` seek ±5s when scrubber has focus on desktop (distinct from TV's D-pad navigation which uses these keys for control-bar traversal — gate: `!isTV`).
- AC5: All shortcuts are no-ops on TV mode so D-pad behavior is unaffected.

### Responsive Layouts

**US-009 — Responsive poster grid on mobile**
As a mobile user I want the movie and series poster grids to reflow to 2 columns on narrow viewports so posters are large enough to tap, with titles visible below each poster without truncation.
_Acceptance criteria:_
- AC1: At `max-width: 767px`, poster grid uses `@container`-driven auto-fill with `--poster-min-width: 140px`, producing 2 columns on a 390px viewport.
- AC2: Card title (1 line max) and year/duration meta-line are fully visible at the mobile poster width — no text overflow or clipping.
- AC3: `@container` rules live in `card.css` (not a route component) so they apply everywhere the card is used.
- AC4: TV poster sizing (`[data-tv="true"]` blocks) is unaffected.

**US-010 — Minimum touch targets on mobile (WCAG 2.5.5)**
As a mobile user I want every interactive element to be at least 44×44px so I can reliably tap controls while in motion.
_Acceptance criteria:_
- AC1: On `pointer:coarse`, all buttons/chips/dock icons have `min-height: 44px; min-width: 44px` via `primitives/button.css`.
- AC2: Focus ring after touch tap does not show (`:focus:not(:focus-visible) { outline: none }` in `index.css`).
- AC3: `axe-core` accessibility scan (already in E2E suite) reports 0 violations specifically on mobile-viewport run.

### Rollback Safety

**US-011 — Atomic rollback in ≤5 minutes**
As the operator I want a single script I can run when a deploy breaks production, restoring both the previous Docker images and the database to their pre-deploy state automatically.
_Acceptance criteria:_
- AC1: `bin/streamvault-rollback.sh <deploy-id>` completes all 7 steps (manifest verify, sha256 check, stop services, pg_restore sv_* tables, re-tag Docker images, restart services, smoke health checks) in ≤ 5 minutes on the VPS.
- AC2: A SHA-256 mismatch on the dump file causes the script to abort before any destructive step.
- AC3: If either service fails to become healthy after restart, the script exits non-zero and prints recovery instructions — it does not silently succeed with unhealthy containers.
- AC4: Rolling back leaves the n8n DB tables (non-sv_*) completely untouched.

**US-012 — Automated pre-deploy snapshot with smoke-pass marking**
As the operator I want the deploy pipeline to capture a restorable snapshot before every deploy so I always have a rollback target, and to only mark that snapshot as "smoke_passed: true" after the new version passes health checks.
_Acceptance criteria:_
- AC1: `bin/streamvault-deploy.sh` takes a snapshot of the current live state before pulling any new code.
- AC2: If post-deploy health checks fail (either service), the script automatically invokes rollback and exits non-zero — the Actions run shows red.
- AC3: `smoke_passed` in the manifest JSON is set to `true` only after all health checks pass.
- AC4: Prune script retains the last 5 `smoke_passed: true` manifests regardless of age, plus any manifest ≤ 14 days old.

---

## 4. Functional Requirements

**FR-01:** `InputModeProvider` detects and exposes `mode: 'keyboard' | 'mouse' | 'touch'` and `platform: 'tv' | 'desktop' | 'mobile'`. Detection priority: touch `pointerdown` > mouse `pointermove` (>2px) > `keydown` arrow/Enter > `pointer:coarse` media query at boot.

**FR-02:** `isTV` is derived once from `document.documentElement.dataset.tv` on mount and is immutable for the session. It cannot be overridden by runtime input events.

**FR-03:** Drag horizontally on player ≥40px enters scrub mode; a seek-preview overlay shows the target timestamp in `mm:ss` or `h:mm:ss` format; release commits the seek. Drag cancelled on `pointercancel`.

**FR-04:** Long-press (≥500ms hold on pointer-down, no movement >10px) on the video area enables 2× `video.playbackRate` for the duration; release restores 1.0.

**FR-05:** Double-tap left third of video: seeks -10s and renders a left-chevron ripple. Double-tap right third: seeks +10s and renders a right-chevron ripple. Both use the shared `seekWithRate` function to maintain history/analytics consistency.

**FR-06:** Vertical swipe on player right half maps to volume. 8px of vertical movement = ±0.05 volume change. Volume indicator widget auto-hides 1.5s after last gesture.

**FR-07:** `DesktopScrubber` is rendered inside `PlayerControls` when `isMouse && !isTV`. It accepts `onSeek`, `duration`, `currentTime`, `hoverEnabled`. First line of component: `if (isTV) return null`.

**FR-08:** `DesktopScrubber` uses pointer-capture (`target.setPointerCapture(e.pointerId)`) on drag start so scrub is not aborted when cursor leaves the bar boundary.

**FR-09:** `PlayerGestureLayer` is lazy-imported via `React.lazy` + `Suspense`. It is only mounted when `!isTV`. On TV the import never runs.

**FR-10:** `GET /api/config/flags` returns `{ flags: Record<string, boolean>, ttl_seconds: number }`. Backend reads from `sv_settings` row `key = 'feature_flags'`. Default TTL: 300s.

**FR-11:** Feature flag client caches flags in `localStorage` under keys `sv_feature_flags` and `sv_feature_flags_ttl`. Fetch has a 3-second `AbortSignal.timeout`. On failure or missing key, all flags return `false` (fail-closed).

**FR-12:** `VITE_FF_<FLAG_NAME>=true` in `.env.local` overrides any backend or cached value. Uppercase flag name only.

**FR-13:** On `pointer:coarse`, all interactive elements (buttons, chips, dock items, card overflow icons) have `min-height: 44px; min-width: 44px`. Enforcement via `primitives/button.css` and a shared class `.sv-touch-target`.

**FR-14:** CSS token `--layout-mode` is set to `desktop` | `mobile` | `tv` via `AppShell` reading `useInputMode().platform` and writing a `data-layout-mode` attribute on its root div.

**FR-15:** `SideNav` (desktop only) and `TopBar` (desktop only) are lazy-imported. Neither component imports from TV-specific modules. Each has `if (isTV) return null` at its top.

**FR-16:** Bottom dock gets `data-hidden="true"` on desktop + CSS `display:none`. It remains mounted in the React tree (norigin focus keys stay registered).

**FR-17:** `bin/streamvault-rollback.sh <deploy-id>` is an idempotent script (safe to re-run). It verifies SHA-256 of the dump before any destructive step.

**FR-18:** `bin/streamvault-deploy.sh` invokes snapshot, deploy, health-check loop (18×5s = 90s max), then auto-rollback on failure. The deploy script is the single entry point called from GitHub Actions.

**FR-19:** `overscroll-behavior: none` is set globally on `<html>` when `pointer:coarse` to prevent pull-to-refresh on the browse grid.

**FR-20:** `:focus:not(:focus-visible) { outline: none }` is added to `index.css` to suppress copper focus rings after touch taps without removing them for keyboard users.

---

## 5. Non-Functional Requirements

**NFR-01 — TV initial JS bundle:** ≤ 243 KB gzip (current baseline ~213 KB gz + 30 KB budget). Measured by `scripts/check-bundle-budget.js` in CI. Adaptive JS for desktop/mobile must be lazy-split from the main chunk.

**NFR-02 — Mobile initial JS bundle:** ≤ 200 KB gzip. Player gesture chunk (lazy) may be up to 220 KB gz (includes `@use-gesture/react` ≈6.8 KB gz).

**NFR-03 — Time-to-Interactive (TV, 4G throttled):** ≤ 4.0s on the existing `npm run perf:prod` Playwright + Lighthouse harness (6× CPU, Slow 4G). Phase additions must not increase TTI.

**NFR-04 — Time-to-Interactive (Mobile, 4G throttled):** ≤ 5.5s measured by the same Lighthouse harness at mobile viewport (390×844).

**NFR-05 — Accessibility (axe-core):** 0 critical or serious violations on every viewport (TV 1920×1080, desktop 1440×900, mobile 390×844) in the existing Playwright E2E accessibility scan. Violations introduced by adaptive changes block PR merge.

**NFR-06 — TV regression gate:** Playwright TV-mode snapshot (Fire TV UA `Mozilla/5.0 (Linux; Android 9; AFT)`) must be pixel-identical across every PR that touches player or nav code. Enforced by CI visual comparison step added in Phase 1.

**NFR-07 — Rollback RTO:** `bin/streamvault-rollback.sh` must complete successfully (all 7 steps) in ≤ 5 minutes on the production VPS. Verified in monthly drill (see §8).

**NFR-08 — Gesture responsiveness:** Touch gesture response latency ≤ 100ms from `pointerdown` to visible feedback (ripple or seek-preview appearance) on iOS Safari 17+ and Android Chrome 124+.

**NFR-09 — Pointer-capture scrub:** Desktop scrubber drag must not lose pointer state when cursor exits the scrubber bar — enforced by `setPointerCapture` in `FR-08`.

**NFR-10 — Feature flag fetch:** `GET /api/config/flags` must respond within 200ms at p95 under normal load. Measured via existing backend health endpoint (`/health` already in place).

**NFR-11 — Reduced motion:** All new animations (ripple, seek-preview, side-nav slide) must respect `prefers-reduced-motion: reduce` (instant show/hide, no transforms). Verified in existing `useReducedMotion` hook audit in Phase 6 polish.

**NFR-12 — No direct-to-main commits:** Every adaptive change follows the branch + PR + merge workflow (per project rule). Direct-to-main is reserved for CI hotfixes only.

---

## 6. In-Scope for Phase 1 — Minimum Viable Adaptive Ship

Phase 1 constitutes "v3 adaptive working" — a user on desktop or mobile can browse and play content, and the operator has a rollback net. Six tightly bounded work items:

| Item | Description | Rationale |
|---|---|---|
| **1. Input-mode abstraction** | `InputModeProvider` + `useInputMode` hook. Zero visible change. | Every subsequent phase depends on this. |
| **2. Feature flag client** | `featureFlags.ts` + `useFeatureFlag` hook + `GET /api/config/flags` BE endpoint. | Enables safe dark launch of all adaptive PRs. |
| **3. Rollback infra** | `bin/streamvault-snapshot.sh`, `bin/streamvault-rollback.sh`, `bin/streamvault-deploy.sh`, `bin/streamvault-prune-snapshots.sh`. Updated deploy.yml. First drill run. | Non-negotiable safety net before any new complexity ships. |
| **4. Responsive layout tokens** | CSS token additions to `tokens.css` (desktop/mobile breakpoints, `--layout-mode`, `--nav-mode`). `overscroll-behavior: none` on mobile. `data-nav-mode` written by `AppShell`. | Pure CSS additions — zero TV impact. |
| **5. Tap-to-toggle controls (mobile player)** | `PlayerGestureLayer` — single tap on player shows/hides controls (lazy, `!isTV` guard). No seek yet. | Smallest useful player touch interaction; validates gesture architecture without scrub complexity. |
| **6. TV regression CI gate** | Playwright TV-mode snapshot added to CI workflow. | Prevents silent TV regressions across remaining phases. |

**Estimated Phase 1 size:**
- LOC: ~600–750 new lines (FE) + ~80 new lines (BE flags endpoint) + ~350 lines bash scripts
- PRs: 3 (BE: flags endpoint; FE: foundation + tokens; OPS: rollback scripts + deploy hook update)
- Not included in Phase 1: SideNav, DesktopScrubber, swipe-to-seek, mobile layout polish

**Phase 1 Go/No-Go Gate:**
- All 342+ existing tests green
- New unit tests ≥ 80% branch coverage on `InputModeProvider` and `featureFlags`
- TV Playwright snapshot baseline captured and pinned in CI
- Rollback drill executed end-to-end on VPS (manual verification)
- All 3 PRs CI-green before any Phase 2 work begins

---

## 7. Out-of-Scope / Deferred

### Phase 2 (next sprint after Phase 1 validated)
- `SideNav` + `TopBar` desktop navigation shell (`US-001`)
- Desktop scrubber (`US-006`, `FR-07`, `FR-08`)
- Click-to-play/pause on desktop video area (`US-007`)
- Full mobile layout polish: safe-area insets, touch targets, container-query poster grid (`US-002`, `US-009`, `US-010`)

### Phase 3 (after Phase 2 validated)
- Full `PlayerGestureLayer`: swipe-to-seek, swipe-to-volume, double-tap zones (`US-005`, `FR-03`–`FR-06`)
- Long-press 2× speed (`FR-04`)
- Keyboard shortcuts for desktop player (`US-008`)

### Phase 4 (hardening)
- Container-query poster grid (`US-009`)
- Tablet breakpoint (768–1023px)
- Mobile PWA manifest (add-to-home-screen, splash screen, theme-color)

### Permanently deferred (out of v3 adaptive scope)
- Picture-in-picture (PiP) floating window
- Chromecast / AirPlay / Cast API
- Mobile cast controls
- Multi-user profiles
- Tamil / Malayalam / Kannada / Punjabi language chips (backend not yet shipping)
- Offline caching / service worker
- Per-show chapter markers

---

## 8. Acceptance Gates Per Phase

### Phase 1 Gate (Foundation)
| Check | Method | Pass Criteria |
|---|---|---|
| All existing tests green | `npm test` | 0 failures |
| New unit coverage | Vitest coverage | ≥ 80% branch on new files |
| TV snapshot regression | Playwright CI (Fire TV UA) | Pixel-identical to baseline |
| Bundle budget | `npm run check-budget` | TV chunk ≤ 243 KB gz |
| Rollback drill | Manual VPS run | All 7 script steps complete, services healthy, drill log saved |
| Feature flag off = no visible change | Manual prod check | `adaptive_responsive: false` → app looks identical to pre-phase |

### Phase 2 Gate (Desktop shell + scrubber)
| Check | Method | Pass Criteria |
|---|---|---|
| All tests green | `npm test` | 0 failures |
| TV snapshot regression | Playwright CI | Pixel-identical baseline |
| Desktop E2E smoke | Playwright (1440×900, pointer:fine) | Login → browse → play → scrub → back succeeds |
| axe-core desktop | Playwright accessibility scan | 0 critical/serious violations at 1440×900 |
| Feature flag flip | Manual: enable `desktop_side_nav` | Side nav renders; dock hidden; TV unchanged |

### Phase 3 Gate (Mobile gestures)
| Check | Method | Pass Criteria |
|---|---|---|
| All tests green | `npm test` | 0 failures |
| TV snapshot regression | Playwright CI | Pixel-identical baseline |
| Mobile gesture QA | Manual on real device (iPhone + Android) | Tap shows controls, swipe seeks, long-press 2× speed all work |
| axe-core mobile | Playwright (390×844) | 0 critical/serious violations |
| Gesture bundle delta | `npm run check-budget` | Player chunk ≤ 220 KB gz |

### Phase 4 Gate (Hardening)
| Check | Method | Pass Criteria |
|---|---|---|
| All tests green | `npm test` | 0 failures |
| Lighthouse mobile | `npm run perf:prod` (mobile viewport) | TTI ≤ 5.5s, score ≥ 85 |
| Container query visual regression | Playwright screenshots at 4 widths | Baselines match |
| Touch target audit | Playwright + axe WCAG 2.5.5 | All touch targets ≥ 44×44px |

---

## 9. Risks (Product-Level)

### Risk 1 — TV regression unnoticed (CRITICAL)
**Description:** A new CSS breakpoint or pointer-event handler silently affects Fire TV Silk, breaking D-pad navigation or tap-rate seek.
**Mitigation:** CI TV-mode Playwright snapshot (Phase 1 gate item 3) runs on every PR that touches player or nav code. If the snapshot diff is non-zero, the PR is blocked. Additionally, `PlayerGestureLayer` and `DesktopScrubber` both have `if (isTV) return null` as their first line — a failing guard is immediately visible in tests.
**Residual risk:** Low after snapshot gate is in CI.

### Risk 2 — norigin focus + mouse click state diverge on desktop (HIGH)
**Description:** When a mouse user clicks a button, `document.activeElement` follows the DOM click target, but norigin's internal `currentFocusKey` remains on the last D-pad-focused element. A subsequent TV-remote press fires from the wrong root.
**Mitigation:** Every norigin-aware interactive element adds an `onClick` that calls `setFocus(focusKey)` to re-sync norigin when mouse is used. A `useSyncMouseFocus` hook (Phase 2) runs `setFocus` on every `focusin` event when `mode === 'mouse'`. The norigin `init()` is never torn down — both systems run in parallel.
**Residual risk:** Medium until Phase 2 ships `useSyncMouseFocus`.

### Risk 3 — Double-tap detection conflicts with single-tap on mobile (MEDIUM)
**Description:** A 300ms detection window for double-tap means single-tap must wait before committing. If the window is too short, double-taps register as two single-taps (two control-show events, no seek). If too long, single-tap feels laggy.
**Mitigation:** Use `@use-gesture/react`'s built-in `onDoubleClick` which uses pointer-events timing — not a setTimeout-based hold timer (lesson from PRs #110/#115). Must validate with real touch devices before Phase 3 flag flip. Fallback: if double-tap is unreliable on iOS, demote it to deferred and ship swipe-to-seek only.
**Residual risk:** Medium — requires real-device QA gate in Phase 3.

### Risk 4 — Feature flag table restored to stale state during rollback (MEDIUM)
**Description:** `sv_settings` (which holds `feature_flags`) is included in the `sv_*` pg_dump. Rolling back restores an older flag state, potentially re-enabling a flag that was just disabled to stop an incident.
**Mitigation (Phase 2 hardening):** Extract `sv_feature_flags` into a separate table excluded from `pg_dump --table='sv_*'` scope. Until then: rollback script prints current and post-restore flag state; operator must manually re-disable any flags that need to stay off. Documented in `bin/streamvault-rollback.sh` output header.
**Residual risk:** Medium short-term; Low after Phase 2 flag-table separation.

### Risk 5 — Mobile safari fullscreen API restricted (LOW-MEDIUM)
**Description:** iOS Safari does not support `document.requestFullscreen()` for `<video>` elements in a normal browser context (requires native `webkitEnterFullscreen` on the video element, which behaves differently). `onDoubleClick` = fullscreen could throw or silently fail.
**Mitigation:** Wrap fullscreen call in `try/catch`; if `requestFullscreen` is unavailable, fall back to `videoRef.current?.webkitEnterFullscreen?.()`. Add UA check in `useInputMode` to expose `isSafariMobile` for conditional paths. Degrade gracefully: no fullscreen = not a blocking bug, just a missing enhancement.
**Residual risk:** Low — acceptable degradation.

---

## 10. Open Product Questions

### OPQ-1: Tap-to-toggle vs tap-to-play on mobile
**Question:** On YouTube Mobile, a single tap shows controls and a second tap within 3s plays/pauses. On TV, Enter always pauses even when controls are hidden. Which model for mobile?
**Recommendation (author):** Match the TV short-circuit rule: **single tap = toggle controls; if controls are already visible, Enter-equivalent action = toggle play/pause on the second tap.** This is consistent with the TV model and reduces implementation surface. User can always tap once to show controls, then tap the visible Play/Pause button.

### OPQ-2: Desktop navigation — side rail or top bar?
**Question:** `02-fe-architecture.md` proposes a side nav for desktop; `01-ux-spec.md` mentions both. Side nav uses screen real estate on the left; top nav uses it on top.
**Recommendation:** **Side rail (icon + label, collapsible).** IPTV apps (Plex, Emby, Jellyfin) all use side nav on desktop. The poster grid needs horizontal space more than it needs vertical. Fixed width: 200px expanded, 60px collapsed (icon-only). Collapses to icon-only on hover-out.

### OPQ-3: Preview URL — always-on vs on-demand?
**Question:** `04-rollback-and-flags.md` designs the preview stack as ephemeral (torn down after CI smoke). Should there be a persistent `preview.streamvault.srinivaskotha.uk` for manual QA between deploys?
**Recommendation:** Keep it on-demand (CI-only) for now. An always-on preview doubles the VPS resource cost and requires a full second DB schema. Once rollback infra is running and the operator has confidence in the deploy pipeline, revisit.

### OPQ-4: Swipe-to-seek on live streams — disable or seek DVR buffer?
**Question:** Xtream live streams can pause briefly and resume at the live edge. Should swipe-to-seek on live be (a) disabled, (b) enabled but capped at -30s (DVR window), or (c) silently ignored?
**Recommendation:** **(a) disabled** — same as the existing TV rule (seek buttons are not rendered on live). Show a subtle "Seeking not available on Live" toast if the user attempts a seek swipe on a live stream. Consistent behavior across all input modes.

### OPQ-5: Long-press speed — 2× or user-configurable?
**Question:** The wishlist says long-press = fast forward. `02-fe-architecture.md` specifies 2× `playbackRate`. Should the speed be fixed or configurable in Settings?
**Recommendation:** **Fixed 2× for Phase 3; configurable (1.5×/2×/3×) in Phase 4 polish.** Configurable requires a Settings UI change and a new `sv_lang_pref`-style storage key. Phase 3 ships the gesture; Phase 4 adds the setting if the user requests it.

---

## Appendix: Story-to-Phase Mapping

| Story | Phase |
|---|---|
| US-001 (desktop side nav) | Phase 2 |
| US-002 (mobile safe-area dock) | Phase 2 |
| US-003 (InputModeProvider) | **Phase 1** |
| US-004 (feature flags) | **Phase 1** |
| US-005 (mobile gestures) | Phase 3 (AC1 tap-to-toggle in Phase 1) |
| US-006 (desktop scrubber) | Phase 2 |
| US-007 (click-to-play desktop) | Phase 2 |
| US-008 (desktop KB shortcuts) | Phase 3 |
| US-009 (mobile poster grid) | Phase 4 |
| US-010 (touch targets) | Phase 2 |
| US-011 (rollback) | **Phase 1** |
| US-012 (snapshot deploy) | **Phase 1** |

---

_End of PRD._
