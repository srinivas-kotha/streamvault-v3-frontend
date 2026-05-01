# StreamVault v3 — Adaptive Responsive Phase (Master Plan)

**Status:** REVISION 1 — eval+grill fixes applied; ready for implementation
**Date:** 2026-04-29
**Owner:** Lead orchestrator (Claude Opus 4.7)
**Branch:** `v3-adaptive/planning`

---

## 0. Changelog

**Revision 1 (2026-04-29)** — Applied 5 blockers from `eval-report.md` + 4 criticals + 6 highs from `grill-report.md`:

- Locked `sv_feature_flags` table + dotted-key naming (`adaptive.player.tap_toggle`) as canonical (was: 4 conflicting variants across specs)
- Reordered PR sequence: BE-1 → OPS-1 → OPS-2 → DRILL → FE-1 → FE-2 (was: ambiguous)
- Preview stack uses **separate `streamvault_preview` Postgres database**, NOT schema prefix (was: would write to prod tables)
- Added **Phase 0** to widen subagent permissions in `settings.local.json`
- `02-fe-architecture` is canonical for norigin init; `01-ux-spec` §OD6 marked illustrative
- **Feature flags excluded from pg_dump** — flags survive rollback so kill-switch isn't undone
- `04-rollback-and-flags.md` is the single source of truth for rollback script (03-be section to be marked "see 04")
- `InputModeProvider` wrapped in ErrorBoundary + `addListener` fallback for old Silk
- `pg_restore --single-transaction --exit-on-error` inside a Postgres txn
- Gesture surface guards: skip when target is `[data-player-control]`
- `e.preventDefault()` on touchend to suppress iOS 300ms ghost click
- Deploy ID adds seconds + both SHAs (was: minute-resolution → collisions)
- `Cache-Control: no-store` on `/api/config/flags` (was: 60s lag on kill-switch)
- Protect last-5 smoke_passed Docker images from prune; add rebuild-from-archive fallback
- Bundle budget unified at **240 KB gz initial** everywhere (was: 213 vs 240 vs 243 across specs)
- Added hard-stop conditions: token exhaustion + paid-service detection

---

## 1. Mission

Add **desktop (mouse + keyboard)** and **mobile (touch + gestures)** as first-class surfaces to StreamVault v3 **without regressing the live Fire TV experience**. Ship YouTube-style player gestures (tap, drag-to-seek, long-press fast-forward) on mobile, click-and-drag scrubber on desktop, and an atomic rollback system that reverts FE + BE + DB together.

**Success bar:** all three surfaces ship behind feature flags, regression-tested in CI, with an exercised rollback drill on file. The user comes back to a working preview URL + a green production with new behavior gated until they say flip.

---

## 2. Operating principles

- **TV is sacred.** No path that affects TV ships without the existing d-pad E2E suite green.
- **Feature-flag everything new.** Every adaptive behavior is gated behind `sv_feature_flags`. Bad flag → instant kill via DB row update. No code rollback needed for behavior changes.
- **No paid services.** Feature flags = in-house Postgres table. Preview URL = Docker Compose alt-port + Caddy. Snapshot = `pg_dump` filtered to `sv_*`.
- **Atomic rollback exists before any prod-affecting deploy.** Wired in Phase 1, drilled in Phase 1.
- **Branch + PR + review + CI + merge.** Never direct-to-main. Auto-merge on green CI + reviewer-agent approval allowed (per user directive while away).
- **Token discipline.** Haiku for reads, sonnet for write/think, opus orchestrates. Long context lives on disk (the 6 expert specs); master plan stays lean.

---

## 3. Locked architecture decisions

| # | Decision | Source | Rationale |
|---|---|---|---|
| A1 | **`@use-gesture/react` v10** as the gesture engine | 02-fe | Pointer-events native; tree-shakeable; lazy-imported so TV bundle delta = 0 |
| A2 | **Input-mode state machine** writes `data-input-mode` on `<html>` (`dpad`/`keyboard`/`mouse`/`touch`) | 01-ux + 02-fe | CSS `pointer:coarse` is unreliable on hybrids; JS state machine is authoritative |
| A3 | **TV is terminal additive.** `data-tv="true"` from existing UA sniff gates ALL TV paths; new surfaces add via `data-input-mode`, never replace | 01-ux | Zero risk of breaking d-pad |
| A4 | **`sv_feature_flags` table on shared Postgres** is the SINGLE source of truth. Schema: `(id, key TEXT, scope TEXT CHECK ('global'\|'user'\|'device'), scope_id TEXT, value JSONB, description, updated_at, updated_by)`. **Keys are dotted lowercase**: `adaptive.player.tap_toggle`, `adaptive.gestures.enabled`, `adaptive.mobile.enabled`, `adaptive.desktop.enabled`. NOT `adaptive_responsive`-style. NOT `sv_settings` JSON blob. | 03-be canonical; corrects FE/04/05 references | One table, one naming convention. FE client and BE migration must agree exactly or flags silently no-op. |
| A5 | **Snapshot = `pg_dump --table='sv_*' --exclude-table='sv_feature_flags' --format=custom -Z 9`** to `/home/crawler/snapshots/{deploy-id}.dump.gz`. **Feature flags are dumped to a SEPARATE file** `{deploy-id}.flags.json` and NOT restored on rollback. | 03-be + 04-rollback + grill #1 | Rollback must NOT undo a kill-switch flip. If feature `X` was disabled at 14:00 because it was breaking prod, rolling back at 14:30 should leave `X` disabled. Code reverts; flags persist. |
| A6 | **Preview URL = Docker Compose alt-port stack + nginx-proxy-manager + Basic Auth** at `preview.streamvault.srinivaskotha.uk` | 04-rollback | Cloudflare/Vercel can't run our backend; stays on-VPS, fully isolated |
| A7 | **Single-tap on mobile player = show/hide controls** (YouTube model), NOT play/pause | 01-ux | Matches user's mental model with YouTube; one-time hint toast covers VLC users |
| A8 | **Volume/brightness vertical-drag is opt-in (default OFF)** behind Settings > Playback > "Swipe gestures" | 01-ux | Top complaint in VLC/MX Player reviews — accidental volume on edge taps |
| A9 | **Rollback script `bin/streamvault-rollback.sh <deploy-id>`** is fail-fast, manifest-verified, idempotent on re-run | 04-rollback | One handle, all-or-nothing |
| A10 | **No physical-device testing** during this phase. Playwright touch emulation + visual regression + screencasts only. Real-device validation happens when user returns | QA/05/06 | User explicitly accepted this gap |
| A11 | **`02-fe-architecture` is canonical for norigin spatial-nav init.** norigin has NO teardown API; do NOT call disable on non-TV. The `01-ux-spec.md` §OD6 snippet is illustrative only. norigin init stays as-is; new layouts coexist via `data-input-mode` rather than disabling spatial nav. | grill #3 / blocker #5 | Disabling norigin would break desktop/mobile focus management entirely. |
| A12 | **Preview Postgres = separate database `streamvault_preview`** on the same Postgres instance, NOT a schema prefix. Preview compose stack uses `DB_NAME=streamvault_preview`. Schema is created from prod migrations on stack-up. | grill #7 / blocker #3 | Schema-prefix workaround would require rewriting ~60 SQL queries; separate DB is the only safe isolation. |
| A13 | **`Cache-Control: no-store`** on `GET /api/config/flags`. Client cache lives only in localStorage with **5-second TTL**. Background refresh on every request is a fire-and-forget. | grill #9 | Kill-switch flip must reach users in seconds, not minutes. |
| A14 | **Deploy ID format**: `deploy-YYYYMMDDHHmmss-{fe-sha7}-{be-sha7}` (was: minute-resolution). Snapshot manifest filename is keyed off this. Two deploys in the same minute no longer collide. | grill #8 | Concurrent CI runs are real on busy days. |
| A15 | **InputModeProvider has ErrorBoundary fallback.** If `MediaQueryList.addEventListener` is missing (old Silk), use `mq.addListener` (deprecated but supported). On any unhandled error, fall back to `data-input-mode="dpad"` and continue. App MUST mount on Fire TV regardless. | grill #3 | Older Silk in field. Crashing the entire app is unacceptable. |
| A16 | **Gesture surface guards**: `PlayerGestureLayer` checks `if (e.target.closest('[data-player-control]')) return;` BEFORE dispatching. Plus `e.preventDefault()` on `touchend` to suppress iOS Safari's 300ms ghost-click. | grill #5 + #6 | Prevents tap-to-toggle from firing simultaneously with button click. |
| A17 | **Hard-stop conditions** (orchestrator): if context approaches limit, OR any tool result indicates paid-service signup, OR a 3rd-party billing prompt appears → STOP and write status report. Do not silently degrade. | requirement #11 | User mandate. |

---

## 4. Phase roadmap

### Phase 1 — Foundation (THIS PHASE)
Ship the substrate. No user-visible new behavior except controlled rollouts.

- BE: feature-flag table + endpoint + admin write
- BE: snapshot script + manifest + retention
- OPS: rollback script + drill
- OPS: preview-URL stack + Caddy/nginx-proxy-manager config
- FE: `InputModeProvider` + `useInputMode` hook
- FE: feature-flag client (`useFeatureFlag`) + localStorage cache + fail-closed fetch
- FE: rollback compat marker (deploy ID embedded in `<meta>`)
- FE: Playwright TV-snapshot CI gate (pixel-locks current TV behavior)
- FE: tap-to-toggle controls on mobile player (smallest gesture; validates architecture)
- CI: bundle budget gates, axe-core 0-violation on critical pages, security-review per PR

**Phase 1 exit criteria:** rollback drill executed and passed. TV E2E green. Mobile tap-to-toggle works in Playwright Mobile Portrait. `GET /api/config/flags` returns Phase 1 seeds.

### Phase 2 — Desktop layer
- Desktop SideNav (200/60px) on `pointer:fine + ≥1024px`
- Desktop TopBar (search-prominent)
- DesktopScrubber (click-to-seek, drag, hover thumbnail)
- `useSyncMouseFocus` to bridge norigin focus on mouse clicks

### Phase 3 — Mobile player gestures (full)
- Drag-horizontal scrub (10s/30s/60s tiers by distance)
- Long-press 2x speed (≥500ms hold, no movement)
- Double-tap left/right zone (±10s)
- Swipe-down close (from top 30%, ≥80px, velocity ≥300px/s)

### Phase 4 — Mobile chrome polish
- Safe-area insets, mobile bottom dock, visibility 3-state
- Container-query poster grid for content rails
- One-time hint toast on first mobile player open

### Phase 5 — Optional mobile gestures (opt-in)
- Vertical drag right edge = volume
- Vertical drag left edge = brightness
- Pinch = fullscreen toggle (where Playwright can't validate; flagged as physical-device-pending)

### Phase 6 — Polish & a11y sweep
- WCAG 2.2 AA pass on all new flows
- Reduced-motion respect throughout
- ARIA roles on every gesture target
- Final perf budgets enforced

**Phases 2–6 are NOT being implemented this session. Only Phase 1.** Phases 2+ become future PRs gated by Phase 1 acceptance.

---

## 5. Phase 1 PR breakdown (this session)

**PR sequence is strict. Each blocks the next.** Order:

```
Phase 0 (no PR; orchestrator-local) ← widen subagent perms
   ↓
PR-BE-1 (feature flags table + endpoint) ← merge + deploy ← seed flags exist
   ↓
PR-OPS-1 (rollback infra) ← merge + deploy ← snapshot/restore scripts on disk
   ↓
PR-OPS-2 (preview URL stack with isolated DB) ← merge + deploy
   ↓
ROLLBACK DRILL ← run + verify + log; gate to FE PRs
   ↓
PR-FE-1 (input-mode + flag client + rollback marker + TV pixel-lock)
   ↓
PR-FE-2 (mobile tap-to-toggle, flag default false)
```

### Phase 0 — Subagent permission widening (NOT a PR)
**Where:** `/home/crawler/.claude/settings.local.json`
**Why:** Memory note: subagents don't inherit main-session bypass. Orchestrator widens allowlist before spawning implementation agents.
**Allow:** `git *`, `npm *`, `npx *`, `gh *`, `docker *`, `psql *`, `bash bin/*`, `pg_dump *`, `pg_restore *`, file write under both repo paths.
**Don't allow:** anything outside `/home/crawler/streamvault-*`, no `rm -rf`, no `docker system prune` outside the rollback script.

### PR-BE-1 — `sv_feature_flags` table + `/api/config/flags` endpoints
**Repo:** streamvault-backend
**Branch:** `v3-adaptive/feature-flags`
**LOC est:** ~250
**Files:**
- `postgres/05-feature-flags.sql` (new migration)
- `src/routers/config.router.ts` (new)
- `src/routers/config.router.test.ts` (new)
- `src/db/featureFlags.ts` (new repository)
- `src/index.ts` (mount router BEFORE events catchall — memory PR #54)

**Endpoints:**
- `GET /api/config/flags` — **Cache-Control: no-store** (per A13). Public read for `scope=global` flags; if authed cookie present, merge user-scope overrides. Response: `{ flags: { "key": value, ... }, etag, fetched_at }`. **No 401 on missing auth — return globals only.**
- `POST /api/config/flags/:key` — admin only (`userId === 1`), CSRF-protected. Body: `{ value, scope?, scope_id? }`. On success, returns 204.

**Phase 1 seed flags (dotted keys, A4):**
- `adaptive.gestures.enabled` = `false`
- `adaptive.mobile.enabled` = `false`
- `adaptive.desktop.enabled` = `false`
- `adaptive.player.tap_toggle` = `false` (Phase 1's only behavior flag)

**Migration must be reversible** — `05-feature-flags.up.sql` + `05-feature-flags.down.sql`. Down drops table cleanly.

**Gates:** vitest router + repo coverage ≥ 80%; integration test against running Postgres; existing routers unchanged; flags endpoint never returns 401 (returns globals on no-auth); `Cache-Control: no-store` asserted in test.

### PR-OPS-1 — Atomic rollback infra
**Repo:** streamvault-backend (scripts live in `bin/`)
**Branch:** `v3-adaptive/rollback-infra`
**LOC est:** ~400 bash + ~50 SQL helpers
**Files:**
- `bin/streamvault-snapshot.sh` (new)
- `bin/streamvault-deploy.sh` (new)
- `bin/streamvault-rollback.sh` (new)
- `bin/streamvault-drill.sh` (new — runs the drill protocol)
- `bin/lib/manifest.sh` (new — manifest read/write/verify helpers)
- `.github/workflows/deploy.yml` (modify — call snapshot before deploy, rollback on smoke fail)

**Snapshot scope (A5):**
- `pg_dump --table='sv_*' --exclude-table='sv_feature_flags' --format=custom -Z 9 -f {deploy-id}.dump.gz`
- Flags dumped separately: `{deploy-id}.flags.json` (NOT restored on rollback)

**Restore (A5 + grill #4):** ALL DB ops in a single transaction:
```bash
psql -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DROP TABLE IF EXISTS sv_xxx CASCADE; -- (loop over sv_* tables, except sv_feature_flags)
\\! pg_restore --single-transaction --exit-on-error --no-owner --dbname=streamvault {deploy-id}.dump.gz
COMMIT;
SQL
```
On any error → `ROLLBACK` → script exits non-zero → recovery instructions printed.

**Smoke endpoints called after rollback:**
- `curl -fsS http://localhost:3001/health` (BE)
- `curl -fsS http://localhost:3006/` (FE returns 200)
- `curl -fsS http://localhost:3001/api/config/flags` (returns globals without auth — per A13)

**Manifest schema** (`{deploy-id}.manifest.json`):
```json
{
  "deploy_id": "deploy-20260429170142-abc1234-def5678",
  "fe": {"git_tag": "v3-adaptive-deploy-...", "git_sha": "abc1234", "image_tag": "...", "dist_path": "..."},
  "be": {"git_tag": "v3-adaptive-deploy-...", "git_sha": "def5678", "image_tag": "..."},
  "db": {"snapshot_path": ".../deploy-...dump.gz", "sha256": "..."},
  "flags_path": ".../deploy-...flags.json",
  "smoke_passed": true,
  "created_at": "2026-04-29T17:01:42Z"
}
```

**Retention (grill #5 + #10):** 14 days OR last 5 `smoke_passed: true`, whichever is longer. **Last 5 smoke-passed Docker image tags are pinned (skipped by `docker system prune`)** via labels: `streamvault.protect=true`. Rollback script also has a **rebuild-from-source fallback** if Docker image is missing: `docker build` from the snapshotted git SHA before re-tagging.

**Disk-fill watchdog:** Snapshot script aborts deploy with loud error if `df /home/crawler/snapshots` shows < 5GB free.

**Drill plan:** Ship a comment-only no-op commit through full deploy → run rollback against the prior deploy_id → verify all smoke endpoints → re-deploy HEAD. Documented in `bin/streamvault-drill.sh`. **Drill MUST run + pass before any FE PR is merged.**

### PR-OPS-2 — Preview URL stack (with isolated DB)
**Repo:** streamvault-backend (Compose lives in this repo)
**Branch:** `v3-adaptive/preview-url`
**LOC est:** ~150 yaml + ~50 caddy/nginx + ~50 bash
**Files:**
- `docker-compose.preview.yml` (new — alt-port stack: FE 3016, BE 3011, **separate DB `streamvault_preview`** per A12)
- `bin/preview-db-init.sh` (new — creates `streamvault_preview` DB if absent, runs migrations, seeds minimal data)
- `nginx-proxy-manager-preview.json` or `Caddyfile.preview` (new — Basic Auth + subdomain routing)
- `bin/streamvault-preview-up.sh` / `bin/streamvault-preview-down.sh` (new)
- `.github/workflows/preview.yml` (new — on PR open, build + preview-up + comment URL on PR)

**DB isolation (A12 / blocker #3 / grill #7):**
- `CREATE DATABASE streamvault_preview` on the same Postgres instance
- Preview BE container env: `DB_NAME=streamvault_preview`
- Preview migrations run from the same SQL files as prod
- Seed: minimal fixture data only (1 admin user, 5 channels, 5 movies)
- **NO connection to prod `streamvault` database from preview stack — verified by config audit**

**Basic Auth secret:** Stored in `.env.preview` (gitignored). CI populates from GitHub secret `PREVIEW_BASIC_AUTH`. Never committed.

**Resource budget (grill #E2):** Preview compose has `deploy.resources.limits` (mem 1G per container, cpus 0.5). Compose `restart: "no"` — preview stack only runs during PR validation, torn down after merge.

**Preview gate:** Phase 1 PRs that affect runtime get a preview URL comment from CI; the post-deploy smoke script targets the preview URL before merging to main.

### PR-FE-1 — Input-mode abstraction + feature-flag client + rollback marker
**Repo:** streamvault-v3-frontend
**Branch:** `v3-adaptive/input-mode-foundation`
**LOC est:** ~700 (front-loaded; future PRs lighter)
**Files:**
- `src/nav/inputMode.ts` (new — state machine: dpad/keyboard/mouse/touch detection)
- `src/nav/InputModeProvider.tsx` (new — wraps app, syncs `<html data-input-mode>`, **wrapped in ErrorBoundary** per A15)
- `src/nav/useInputMode.ts` (new — hook)
- `src/nav/InputModeErrorBoundary.tsx` (new — falls back to `dpad` mode on any error)
- `src/config/featureFlags.ts` (new — fetch + 5s localStorage TTL + fail-closed; per A13)
- `src/config/useFeatureFlag.ts` (new — hook with loading state)
- `src/main.tsx` (modify — wrap app in `InputModeErrorBoundary > InputModeProvider`)
- `index.html` (modify — `<meta name="sv-deploy-id">` placeholder)
- `vite.config.ts` (modify — inject deploy_id at build time from `VITE_DEPLOY_ID` env)
- `tests/inputMode.spec.ts` (new — vitest, includes Silk fallback path test)
- `tests/featureFlags.spec.ts` (new — vitest, includes 5s TTL + fail-closed + 401-handling)
- `e2e/tv-snapshot.spec.ts` (new — Playwright TV-mode pixel-lock, runs every PR; tolerance `maxDiffPixelRatio: 0.01`)

**MediaQueryList compat (A15):** `inputMode.ts` checks `if (mq.addEventListener) ... else if (mq.addListener)` for old Silk. Wrapped in try/catch; ErrorBoundary catches anything that escapes.

**Bundle budget:** TV initial ≤ **240 KB gz** (unified per Revision 1). Mobile initial ≤ 200 KB gz. Verified by `scripts/build-perf-report.mjs`. CI fails if exceeded.

**Phase-1 behavior:** with all flags false (default), app behaves exactly as today. Verified by `tv-snapshot.spec.ts` baseline match. Mock the clock + EPG times for stable snapshot (Playwright `clock.install()` + MSW for `/api/epg`).

**Loading state:** `useFeatureFlag` returns `{ value, loading }` — components render Phase-1 unchanged behavior while `loading === true`. No flicker.

### PR-FE-2 — Mobile tap-to-toggle controls (Phase 1's only behavior change)
**Repo:** streamvault-v3-frontend
**Branch:** `v3-adaptive/mobile-tap-toggle`
**LOC est:** ~250
**Files:**
- `src/player/PlayerGestureLayer.tsx` (new — returns `null` on TV; mobile/desktop only)
- `src/player/PlayerShell.tsx` (modify — mount PlayerGestureLayer behind `useFeatureFlag('adaptive.player.tap_toggle')`)
- `tests/playerGestures.spec.ts` (new — vitest unit)
- `e2e/mobile-tap-toggle.spec.ts` (new — Playwright Mobile Portrait)
- `e2e/mobile-tap-toggle-control-guard.spec.ts` (new — verifies tap on play button does NOT also fire tap-toggle, per A16)

**Hard guards (A16, grill #5 + #6):**
1. `if (isTV) return null;` at top of PlayerGestureLayer
2. `if (e.target.closest('[data-player-control]')) return;` before tap dispatch
3. `e.preventDefault()` on `touchend` to suppress iOS Safari 300ms ghost-click
4. All control buttons (`PlayPauseButton`, `SeekButton`, etc.) have `data-player-control` attribute

**Animation:** controls fade in/out 200ms (cubic-bezier ease-out per UX §8). Re-tap during animation cancels and reverses immediately (uses `transform` + `opacity`, GPU-accelerated, idempotent).

**Acceptance:** with `adaptive.player.tap_toggle=true` for test user, single tap on mobile player toggles control visibility WITHOUT triggering button click. With flag off, behavior unchanged. TV behavior unchanged regardless of flag value (verified by `tv-snapshot.spec.ts`).

---

## 6. Per-PR gate (every PR)

```
┌─────────────────────────────────────────────────────────┐
│ 1. lint (eslint)                                        │
│ 2. typecheck (tsc --noEmit)                             │
│ 3. vitest (unit + integration)                          │
│ 4. bundle budget — TV 240 KB gz, player 200 KB gz       │
│ 5. Playwright E2E (changed surfaces only via @tag)     │
│ 6. TV d-pad smoke E2E (always — non-negotiable)         │
│ 7. axe-core 0 violations on critical pages              │
│ 8. security-review skill (Claude Code)                  │
│ 9. code-reviewer agent — must approve                   │
│ 10. CI green on all of the above                        │
└─────────────────────────────────────────────────────────┘
                         ↓
              Auto-merge eligible (per user directive)
                         ↓
                Deploy via CD pipeline
                         ↓
        Pre-deploy snapshot → deploy → post-deploy smoke
                         ↓
            On smoke fail → bin/streamvault-rollback.sh
```

---

## 7. Risk register

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | TV regression goes unnoticed | CRITICAL | TV-snapshot Playwright gate runs on every PR (tolerance 0.01). `if (isTV) return null` hard guard at top of every adaptive component. Clock + EPG mocked for stability. |
| R2 | norigin focus diverges from mouse focus on desktop | HIGH | `useSyncMouseFocus()` ships in Phase 2; in Phase 1 desktop is gated off. **norigin is never disabled** (A11). |
| R3 | Feature-flag fetch blocks app boot on slow network | HIGH | 3-second `AbortSignal.timeout`; fail-closed (all flags default false); fire-and-forget after first cached response; loading state available via hook. |
| R4 | pg_dump/restore mid-failure leaves DB inconsistent | HIGH | `pg_restore --single-transaction --exit-on-error` inside Postgres txn (A5/grill #4). Re-runnable. ROLLBACK on error. |
| R5 | Snapshot disk fills up | MEDIUM | Retention 14d OR last 5 smoke-passed. `df < 5GB` watchdog aborts deploy loudly. |
| R6 | Playwright touch ≠ real iOS Safari | MEDIUM | Acknowledged gap in QA matrix. `e.preventDefault()` on touchend (A16) covers known iOS 300ms ghost-click. Real-device validation deferred to user. |
| R7 | Auto-merge ships a broken PR while user is away | HIGH | Strict gate: code-reviewer agent + security-review + 0 axe violations + bundle budget + green CI + TV pixel-lock ALL pass. First auto-merge ONLY after rollback drill green. |
| R8 | Drag-scrub vs swipe-close conflict on mobile | LOW | Phase 1 ships only tap-toggle; conflict resolves in Phase 3. |
| R9 | `/api/config/flags` 401 blocks unauthed landing | MEDIUM | Per A4: endpoint never returns 401 — returns globals on no-auth. |
| R10 | Old v2 archive deletes something still depended on | MEDIUM | Archive ONLY after Phase 1 acceptance + grep confirms zero live refs. Per `gh repo archive` (read-only), not delete — reversible. |
| R11 | Rollback re-enables a feature kill-switch had disabled | CRITICAL | Per A5: `sv_feature_flags` excluded from pg_dump scope. Code reverts; flags persist. |
| R12 | InputModeProvider crashes on old Silk → app fails to mount on Fire TV | CRITICAL | Per A15: ErrorBoundary fallback to `dpad` mode. `addEventListener`/`addListener` compat. App MUST mount on Fire TV. |
| R13 | Tap on play button fires both gesture toggle AND button click | HIGH | Per A16: `data-player-control` skip + `e.preventDefault()` on touchend. Dedicated E2E test. |
| R14 | Two deploys in same minute → manifest collision | MEDIUM | Per A14: deploy ID has seconds + both SHAs. CI also serializes deploys via concurrency group. |
| R15 | Cache-Control 60s lag delays kill-switch | HIGH | Per A13: `no-store` + 5s localStorage TTL. Kill-switch propagates within 5s globally. |
| R16 | Docker prune deletes tagged rollback images | HIGH | Per Section 5 OPS-1: `streamvault.protect=true` label on last-5 smoke-passed; rebuild-from-source fallback in script. |
| R17 | Preview stack writes to prod DB | CRITICAL | Per A12: separate `streamvault_preview` Postgres database. Verified by config audit at preview-up. |
| R18 | Rollback during active write load → lost data | MEDIUM | `streamvault-rollback.sh` includes 10-second drain notice in header. Rollback windows are operator-chosen, not automatic during live traffic. Auto-rollback on smoke-fail ONLY happens immediately post-deploy when traffic is minimal. |
| R19 | Subagent hits permission prompt → autonomous flow halts | HIGH | Per Phase 0: settings.local.json widened with explicit allowlist before first agent spawn. |
| R20 | Token exhaustion mid-implementation | MEDIUM | Per A17: orchestrator tracks context; on threshold, writes status report, stops cleanly. User can resume from status. |
| R21 | Status report itself is wrong | MEDIUM | Status report is a checklist tied to artifacts (PR URLs, commit SHAs, drill log path). User can verify by reading artifacts directly, not trusting prose. |
| R22 | GitHub API rate limit during multi-PR phase | LOW | Phase 1 is 5 PRs across 2 repos. Well under 5000/hr authenticated limit. Use `gh` retry on transient. |
| R23 | Concurrent CI deploys stomp each other's snapshots | MEDIUM | GitHub Actions `concurrency: group: deploy-prod, cancel-in-progress: false` queues deploys serially. |
| R24 | Transitive npm dep with paid SaaS pull | MEDIUM | `npm ls --all` audit before PR-FE-1 merge. Known clean: hls.js, mpegts.js, react, vite, tailwind, zustand. New: `@use-gesture/react` is OSS-only. |
| R25 | Code-reviewer agent rubber-stamps a regression | HIGH | Reviewer agent prompt includes explicit checks: (a) does this regress TV? (b) is the change behind a flag? (c) are gates wired? Failure to address ANY → block. |

---

## 8. Definition of Done — Phase 1

Phase 1 is "done" only when ALL of these are true:

- [ ] All 5 Phase 1 PRs merged to main on their respective repos
- [ ] CI green on main for both repos (5 consecutive runs)
- [ ] Atomic rollback drill executed against a real deploy-id and passed (smoke green post-rollback)
- [ ] `tv-snapshot.spec.ts` baseline locked in; CI fails if any unintentional TV pixel diff
- [ ] `axe-core` 0 violations on Live, Movies, Series, Search, Player pages (5 critical)
- [ ] Bundle budget verified: TV initial ≤ 240 KB gz (unified per Rev 1), mobile player chunk ≤ 200 KB gz
- [ ] `GET /api/config/flags` returns Phase 1 seeds in production
- [ ] Preview URL stack live at preview.streamvault.srinivaskotha.uk with Basic Auth
- [ ] `bin/streamvault-rollback.sh` runs end-to-end against a synthetic deploy-id without errors
- [ ] Status report written to `.claude/status/streamvault-v2-progress.md` with PR list, drill outcome, what's left for Phase 2

User-validation gate (BLOCKING for Phase 2 start, not for Phase 1 completion):
- [ ] User has tested mobile tap-toggle on a real phone
- [ ] User has tested TV experience for any subjective regression
- [ ] User has reviewed rollback drill log

---

## 9. Reference index

Detailed expert specs (load on demand). All paths relative to repo root.

In `streamvault-v3-frontend`:
- `docs/plans/v3-adaptive/01-ux-spec.md` — 907 lines, gesture grammar with thresholds, breakpoint strategy, accessibility, animation timings
- `docs/plans/v3-adaptive/02-fe-architecture.md` — 639 lines, gesture engine choice, input-mode abstraction, phase plan, bundle budget analysis
- `docs/plans/v3-adaptive/04-rollback-and-flags.md` — 712 lines, full rollback script outline, snapshot scheme, preview-URL infra, drill protocol
- `docs/plans/v3-adaptive/05-product-scope.md` — 396 lines, user stories, FRs, NFRs, in/out scope, product risks
- `docs/plans/v3-adaptive/06-qa-matrix.md` — 478 lines, test matrix per surface × page, gates, gesture coverage approach, physical-device gap
- `docs/plans/v3-adaptive/eval-report.md` — Phase-evaluator scorecard + blockers (Revision 1 sources)
- `docs/plans/v3-adaptive/grill-report.md` — Adversarial failure-mode catalog (Revision 1 sources)

In `streamvault-backend`:
- `docs/plans/v3-adaptive/03-be-architecture.md` — 388 lines, sv_feature_flags schema, endpoints, migration SQL, mobile API audit. **Note:** Section "Atomic rollback BE spec" is superseded by `streamvault-v3-frontend/docs/plans/v3-adaptive/04-rollback-and-flags.md` (single source of truth — A11/blocker #5/grill #2).

---

## 10. What happens next (sequence)

1. ✅ **Master plan written** (this document)
2. ✅ **Phase-evaluator pass** — see `eval-report.md`
3. ✅ **Grill-me pass** — see `grill-report.md`
4. ✅ **Plan revision** — see Section 0 Changelog
5. ⏳ **Plan PR opened** for traceability (planning branch → main)
6. ⏳ **Phase 0**: widen subagent permissions in `settings.local.json`
7. ⏳ **GitHub issues created** for each Phase 1 PR
8. ⏳ **PR-BE-1**: feature flags table + endpoint → merge → deploy
9. ⏳ **PR-OPS-1**: rollback infra → merge → deploy
10. ⏳ **PR-OPS-2**: preview URL stack with isolated DB → merge → deploy
11. ⏳ **ROLLBACK DRILL**: run + verify + log (BLOCKING gate to FE PRs)
12. ⏳ **PR-FE-1**: input-mode + flag client + rollback marker + TV pixel-lock
13. ⏳ **PR-FE-2**: mobile tap-to-toggle (flag default false)
14. ⏳ **Status report** written at `.claude/status/streamvault-v2-progress.md`
15. ⏳ User returns → validates real-device → flips `adaptive.player.tap_toggle=true` for self → opens Phase 2
