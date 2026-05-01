# Grill Report — StreamVault v3 Adaptive Responsive Phase
**Reviewer:** grill-me (adversarial sonnet agent)
**Date:** 2026-04-29
**Verdict at end**

---

## A. Atomic Rollback Failure Modes

### A1 — pg_restore mid-failure leaves DB in partial state — CRITICAL

**Finding:** The rollback script drops ALL sv_* tables in a plain `DO $$ ... CASCADE` block outside any transaction, then calls `pg_restore`. If `pg_restore` is killed (OOM, network blip, operator Ctrl-C) after the DROP succeeds but before restore completes, ALL sv_* tables are gone — users, favorites, watch history, everything. The fallback says "re-run the script" but re-running `pg_restore` on a partially-restored state where some tables already exist may produce FK constraint errors or duplicate-key errors, making the second run fail too.

**Reproduction:** Run `bin/streamvault-rollback.sh <id>` on VPS with 768 MB RAM limit while a large VOD catalog sync is running in another container. OOM killer evicts `pg_restore`. Tables are dropped, none are restored. Re-run fails with `ERROR: relation "sv_users" already exists` (some tables got created before OOM).

**Why "fail loud" doesn't fully save you:** The script calls `|| fail "..."` after `pg_restore`, so it logs loudly. But `fail()` just prints instructions and exits — it does NOT restore tables. The DB is now empty of sv_* data. The API returns 500 on every request. This is a prod outage of indeterminate length.

**Mitigation required:**
1. Wrap the entire DROP + pg_restore sequence in a single Postgres transaction. Use `pg_restore --single-transaction` together with `--format=custom` (custom format supports single-transaction). Add `--exit-on-error` to abort on first error.
2. Before dropping, write a "rollback in progress" flag to a file (`/tmp/sv_rollback.lock`) and add the re-run check: if the lock file exists and pg_restore failed, skip the DROP and go straight to pg_restore (tables are already gone). This makes re-runs safe.
3. The plan doc (04-rollback-and-flags.md §8 R1) acknowledges this as "future hardening" — it is NOT future hardening for a production system. Move it to Phase 1 required.

---

### A2 — sha256 mismatch fails loud but leaves services stopped — HIGH

**Finding:** The rollback script verifies sha256 before touching anything, and correctly calls `fail()` on mismatch. However, `fail()` prints a recovery message but does NOT restart services. Step 3 (stop services) happens AFTER Step 2 (verify sha256). So if sha256 fails, services were never stopped — that's fine and services are still up.

Wait — re-reading the script: Step 2 is sha256 check, Step 3 is stop services. Order is correct; sha256 failure exits before stop. **This particular path is actually safe.**

However: what if the manifest.json itself is corrupted (disk write interrupted mid-write during deploy)? `python3 -c "import json..."` will throw a `json.JSONDecodeError`, which is not caught. `set -euo pipefail` means the script exits immediately. But it exits AFTER the `exec > >(tee ...)` redirect is set up, so the error goes to the log. Services are still running. **This path is safe too.**

**Actual gap found:** The manifest sha256 field stores the hash of the DUMP file, but the script only verifies the dump. The FE static dir (`{deploy-id}-fe/`) and BE source archive (`{deploy-id}-be-src.tar.gz`) have no integrity check. A silent disk corruption on the FE dir would cause `docker tag` to succeed (image is still in Docker daemon, not the dir), so this is only a risk if the Docker image itself was pruned and the script tries to rebuild from the be-src.tar.gz. Currently there's no rebuild path from the archive — it's stored but never used in the rollback script.

**Severity for stated failure:** MEDIUM (the FE dir is not used in rollback; Docker images are used). But the be-src.tar.gz is also never used — the rollback uses `docker tag` on pre-tagged images. If those images were pruned (normal Docker housekeeping), rollback fails at Step 5 with no recovery path. See A5.

---

### A3 — Race condition: rollback runs while user is mid-stream — HIGH

**Finding:** The rollback script calls `docker compose stop streamvault-v3-frontend` then `docker compose stop streamvault-api`. This kills active HTTP connections. A user watching a live stream via HLS.js will have their segment requests aborted mid-download. HLS.js will retry (error recovery), see 502, and surface "stream offline" overlay. This is acceptable.

**The real race condition is in the DB step:** Between Step 3 (stop services) and Step 4 (drop tables), there is a ~5 second window where the API container is stopped but the Postgres connection pool is still open (Node.js pool connections persist until the container actually exits). If `docker compose stop` sends SIGTERM and Node.js doesn't flush all connections before the 10-second stop timeout, the Postgres DROP TABLE commands may run while stale pool connections are still authenticated and could interfere.

**More concrete risk:** `docker compose stop streamvault-api` sends SIGTERM. Node.js exits gracefully after processing in-flight requests (good). But if a request was in the middle of a Postgres transaction (e.g., `sv_history` INSERT), that transaction is not committed. When pg_restore then runs, the uncommitted transaction holds a row lock on `sv_history`. `DROP TABLE sv_history CASCADE` will block until the lock is released. The lock is released when the Postgres connection closes (when the Node.js process dies). Node.js dies when the SIGTERM handler completes. The rollback script calls `docker compose stop` which waits for the container to stop before returning — so by the time the script reaches the DROP, the container IS stopped and locks ARE released.

**Verdict:** The stop-then-drop ordering is correct. Race condition risk is LOW for normal operations. No change required here, but add a 2-second sleep between `docker compose stop streamvault-api` and the DROP to be safe on slow containers.

---

### A4 — FE rollback succeeds, BE rollback fails — CRITICAL

**Finding:** The rollback script is monolithic — it rolls back BOTH FE and BE atomically in a single script. However, the deploy system has TWO separate `deploy.yml` workflows: one for BE, one for FE, deployed independently. The BE spec (`03-be-architecture.md`) describes `bin/rollback.sh` separately from the FE spec's `bin/streamvault-rollback.sh`. There appear to be TWO rollback scripts with different implementations.

Specifically:
- `04-rollback-and-flags.md` describes `bin/streamvault-rollback.sh` — rolls back both FE and BE together from a combined manifest
- `03-be-architecture.md` describes `bin/rollback.sh` — rolls back BE only, using a different snapshot dir (`/data/streamvault/snapshots/` vs `/home/crawler/snapshots/`)

**The two scripts are inconsistent:**
- Different snapshot directories
- Different dump formats (03: `gunzip -c | psql` with SQL dump; 04: `pg_restore` with custom-format dump)
- `bin/rollback.sh` from 03 uses `git checkout "$BE_SHA"` then rebuilds (`docker compose up -d --build`) — this rebuilds from source and takes 3–5 minutes. The 04 version uses pre-tagged Docker images — much faster.

**Reproduction:** Agent implementing PR-OPS-1 reads spec 03 for BE rollback details and spec 04 for the combined rollback. Agent implements `bin/rollback.sh` per spec 03 (SQL plain-text dump) and `bin/streamvault-rollback.sh` per spec 04 (custom format). Both exist. CI drill calls `streamvault-rollback.sh`. In production, operator under pressure may run `rollback.sh` instead, which uses a different snapshot dir and fails to find the dump.

**Mitigation required:**
1. Consolidate into ONE rollback script. Delete the conflicting spec from 03-be-architecture.md §3. The master plan (04-rollback-and-flags.md) should be authoritative.
2. The snapshot directory must be agreed in ONE place. Use `/home/crawler/snapshots/` (consistent with 04).
3. CI drill must test the exact script that operators would run. Document the single canonical path.

---

### A5 — Docker image registry unreachable during rollback — HIGH

**Finding:** The rollback script does `docker tag "$FE_IMAGE" ai-orchestration-streamvault-v3-frontend:latest`. This only works if the image `ai-orchestration-streamvault-v3-frontend:{DEPLOY_ID}` is still in the **local Docker daemon image store**. Docker's default behavior is to keep images until explicitly pruned. But:

1. `docker image prune -a` (manual cleanup, automated cron job on VPS, or a failed deploy that included a cleanup step) removes untagged images. Since `{DEPLOY_ID}` tags are applied at deploy time and may not appear in compose files, they could be considered "dangling" by some prune strategies.
2. If the VPS runs low on disk, operators or automated scripts may run `docker system prune` which removes all stopped containers, dangling images, and networks — this would delete the tagged images.
3. The be-src.tar.gz is in the snapshot directory but the rollback script has NO fallback to rebuild from it. The `fail()` message just says "rebuild required" with no instructions.

**Reproduction:** VPS disk fills to 90%, operator runs `docker system prune -a` to free space. This deletes all images not currently used by a running container. The tagged snapshot images `:{DEPLOY_ID}` are not referenced by any running container. Now `docker tag` in rollback fails. Rollback aborts. Services are stopped (if rollback reached Step 5 before the fail). DB has been restored but FE and BE containers won't start with their old images.

**Mitigation required:**
1. After tagging images at deploy time, write a `docker image ls | grep {DEPLOY_ID}` check and alert if count < 2.
2. The rollback script's `fail()` for image-not-found should include: `docker build` instructions from the be-src.tar.gz. Or better: store the FE dist tar.gz separately and rebuild the FE container from it (FE rebuilds in ~30s since it's just nginx serving static files).
3. Add to the prune script: explicitly protect the last 5 `smoke_passed=true` deploy-tagged Docker images from pruning.

---

### A6 — Snapshot taken during partial write (bad pre-deploy state) — MEDIUM

**Finding:** The snapshot captures the current LIVE state before deploying. If the current live state is itself corrupted (e.g., a previous failed migration left sv_* tables inconsistent), rolling back to it restores the corrupted state. This is acknowledged implicitly nowhere in the plan.

**Specific scenario:** A previous deploy ran a migration that added a NOT NULL column to `sv_favorites` but the data backfill query failed halfway. Half the rows have NULL in the NOT NULL column (a Postgres check constraint was deferred). The snapshot captures this broken state. The next deploy snapshots this broken DB. If that deploy also fails, rolling back restores a database with constraint violations.

**Mitigation required:** Add a DB health check step to `bin/streamvault-snapshot.sh`:
```bash
docker exec postgres psql -U crawler_admin -d n8n -c "
  SELECT tablename, pg_relation_size(quote_ident(tablename))
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'sv_%'
  ORDER BY tablename;" || fail "DB health pre-check failed; snapshot aborted"
```
Additionally, run `pg_dump --table='sv_*'` with `--on-conflict-do-nothing` and validate the dump size is within ±50% of the previous snapshot to detect anomalous dumps.

---

### A7 — sv_feature_flags table restored to snapshot state during rollback — CRITICAL

**Finding:** The `sv_feature_flags` table is a `sv_*`-prefixed table and IS included in the `pg_dump --table='sv_*'` snapshot. This means rollback restores feature flag state to whatever it was at deploy time. 

**Scenario:** An incident occurs. Operator flips `adaptive.gestures.enabled = false` in the DB as an emergency kill-switch. This stops the bad behavior. But the root cause is a BE bug requiring a full rollback. Operator runs `bin/streamvault-rollback.sh`. The rollback restores the DB snapshot, which has `adaptive.gestures.enabled = true` (the value at deploy time, before the kill-switch). The bad gesture behavior immediately re-enables itself. The kill-switch was completely ineffective as a complement to rollback.

The plan's spec 04 §8 R4 identifies this risk but marks it as "future hardening" (separate non-snapshot `sv_feature_flags` table). This is NOT future hardening — it is a fundamental design conflict that makes the kill-switch and the rollback mutually exclusive.

**Mitigation required:**
1. Before merge, decide: either (a) exclude `sv_feature_flags` from the pg_dump with an explicit `--exclude-table=sv_feature_flags` flag, and restore flags separately from the manifest JSON after pg_restore; or (b) accept that rollback ALWAYS resets flags to deploy-time values and document this explicitly so operators know to re-apply kill-switches post-rollback.
2. The manifest already captures `feature_flags` JSON — use this to re-apply intended flag states after rollback.
3. The rollback script should print a warning: "NOTE: feature flags have been restored to snapshot state: {flags_json}. If you had a kill-switch active, re-apply it now."

---

## B. Auto-Merge Failure Modes

### B1 — Code-reviewer agent rubber-stamps — HIGH

**Finding:** The plan says "code-reviewer agent must approve." There is no gate on the reviewer agent's quality. The reviewer agent is a sonnet instance running against the diff. It can be socially engineered by well-written code comments or by code that is correct at the unit-test level but behaviorally wrong.

**Scenario:** PR-FE-2 adds `PlayerGestureLayer.tsx`. The agent reads the diff, sees it has tests, sees lint passes, sees the bundle is under budget. The component has a subtle bug: `if (isTV) return null` is conditioned on `useInputMode().isTV` — but `InputModeProvider` hasn't mounted yet on first render (it's wrapping `<App>` but has an async initialization path). On first render, `isTV` is `false` (default), so `PlayerGestureLayer` MOUNTS on TV, consuming pointer events for one frame before the UA sniff completes and `isTV` flips to `true`. The reviewer agent, looking at the logic, sees the guard and approves.

**Why tests don't catch this:** The TV-snapshot Playwright test checks the final rendered state AFTER React has fully committed. It doesn't test the intermediate state during hydration.

**Mitigation required:**
1. The `isTV` sentinel must be synchronously set on first render, not asynchronously. The UA sniff (`document.documentElement.dataset.tv === 'true'`) is synchronous — the spec (02-fe) correctly says "reads this once on mount; it's stable." Implement it as the initial state value in `useReducer`, not as a side-effect. Add an explicit test: `InputModeProvider` renders with `isTV = true` synchronously when `data-tv="true"` is present on `<html>` at mount time.
2. The code-reviewer agent should be given an explicit adversarial prompt: "Assume the person who wrote this code was trying to sneak in a subtle regression. What would it be?"

---

### B2 — Security review doesn't catch SQL injection in migration — HIGH

**Finding:** The security-review skill is described in the plan but its actual capability is not defined in the plan documents. The migration file `postgres/05-feature-flags.sql` contains:

```sql
INSERT INTO sv_feature_flags (key, scope, value, description)
VALUES ('adaptive.mobile.enabled', 'global', 'false'::jsonb, '...')
ON CONFLICT (...) DO NOTHING;
```

This is static SQL — no injection risk here. However, the `POST /api/config/flags/:key` endpoint uses `:key` as a URL parameter which is then used in a DB query. If implemented as:
```typescript
await db.query(`UPDATE sv_feature_flags SET value = $1 WHERE key = '${req.params.key}'`, [value])
```
instead of parameterized:
```typescript
await db.query(`UPDATE sv_feature_flags SET value = $1 WHERE key = $2`, [value, req.params.key])
```
...this is a SQL injection vulnerability. The security-review skill may or may not catch this depending on implementation.

**The CSRF gap on the kill-switch endpoint:** The `POST /api/admin/flags` endpoint shown in spec 04 §6 is described as going through `csrfMiddleware` already in the chain — that's fine for browser requests. But the kill-switch is designed to be called from the VPS command line (`curl -X POST /api/admin/flags -d '{"new_player":false}'`). A curl command won't have the CSRF cookie. Does the admin endpoint bypass CSRF? If not, the kill-switch can't be used from a terminal during an incident.

**Mitigation required:**
1. The `POST /api/config/flags/:key` endpoint spec must explicitly require parameterized queries. The CLAUDE.md already says "Parameterized SQL only — no string concatenation" — add an explicit test for the key parameter.
2. Define whether the kill-switch endpoint requires CSRF. If it's a curl-invokable endpoint, add IP allowlist protection (LAN only, like the existing AUTH_BYPASS_IPS) instead of CSRF.

---

### B3 — Malicious console.log of session token — MEDIUM

**Finding:** The security-review skill running on diffs would need to flag `console.log(document.cookie)` or `console.log(token)` added in a PR. Static analysis (ESLint) with `no-console` would flag `console.log`, but:
1. `no-console` is a warning, not an error, in most configs. The plan says "lint (eslint)" must pass — if `no-console` is a warning rather than error, it passes.
2. The token could be logged via `console.info`, `console.debug`, or `logger.log()` which `no-console` doesn't catch.
3. A session cookie is httpOnly — it can't be read by JS from `document.cookie`. So a cookie theft via console.log is actually impossible for the httpOnly JWT. The CSRF token (`sv_csrf`) IS readable by JS (it needs to be). Logging it is a security issue but less critical.

**Verdict:** The httpOnly cookie architecture makes this less dangerous than it appears. MEDIUM severity.

**Mitigation:** Ensure ESLint `no-console: error` (not warn) in the CI lint step. Add a grep-based check in security-review for patterns: `console\.(log|info|debug)\(.*token` and `console\.(log|info|debug)\(.*cookie`.

---

### B4 — TV snapshot pixel-lock diff tolerance — MEDIUM

**Finding:** The plan says "TV-snapshot Playwright gate, pixel-locks current TV behavior, 0 unintentional pixel diffs." In practice, `playwright.expect(screenshot).toMatchSnapshot()` has a configurable `maxDiffPixels` and `threshold` (per-pixel color distance). The plan does not specify these values.

**Scenario:** `InputModeProvider` wraps the app in `main.tsx`. On TV, `isTV = true`. But the provider adds one `<div>` wrapper in the React tree. If that div has any default CSS (e.g., `display: block` vs the existing top-level structure), it could reflow the layout by 1px. Playwright's default `threshold: 0.2` (20% per-pixel color distance) and `maxDiffPixels: 0` (zero pixel tolerance) would catch this — but only if `maxDiffPixels` is explicitly set to 0. If the agent implementing the test uses the Playwright default `maxDiffPixelRatio: undefined` and `threshold: 0.2`, a 1px font-rendering difference (antialiasing) would pass.

**Mitigation required:** The test spec `e2e/tv-snapshot.spec.ts` must explicitly set `{ maxDiffPixels: 0, threshold: 0 }` in `toMatchSnapshot()`. The plan should specify this tolerance in the gate definition.

---

## C. Feature-Flag System Failure Modes

### C1 — Postgres connection pool exhausted returns 500, FE gets unhandled error — HIGH

**Finding:** The FE `featureFlags.ts` fetch handler:
```typescript
if (!res.ok) throw new Error(`${res.status}`)
```
This catches non-2xx responses. BUT: if `res.status` is 500 (BE up but Postgres is down), the `catch` block sets `{ loaded: true }` with empty flags — fail-closed, all flags false. This is CORRECT behavior.

**However:** The `node-cache` in `feature-flags.service.ts` has a 30s TTL. When Postgres goes down, the FIRST request after cache expiry will fail with a connection pool error, and the cache is not refreshed. Every subsequent request (every user, every page load) for 30 seconds hits the DB directly (cache miss). 120 req/min (apiLimiter) × 30s = 60 requests all hitting a failing DB simultaneously. This doesn't cause data loss but does cause a thundering herd on DB recovery.

**The real issue:** The cache should use stale-while-revalidate. On a DB error during refresh, serve the PREVIOUS cached value (which may be 30+ seconds old but still correct). The current implementation (`node-cache` with simple TTL) deletes the cache entry on expiry — there is no stale value to serve.

**Mitigation required:** Implement stale-while-revalidate: when the cache TTL expires, attempt refresh but if it fails, extend the cache TTL by another 30s with the old value. Add `const stale = cache.get<FlagMap>(CACHE_KEY)` before attempting DB query; on error, re-set the stale value.

---

### C2 — 60-second HTTP cache prevents immediate kill-switch effect — HIGH

**Finding:** `GET /api/config/flags` returns `Cache-Control: private, max-age=60`. The FE also caches in `localStorage` with a `ttl_seconds` value from the response. So the effective cache chain is:

1. HTTP cache: 60 seconds
2. localStorage cache: whatever `ttl_seconds` the server returns (not specified in the plan — is it 60? 300?)

If the operator flips a flag to disable a broken feature, the effect is delayed by up to 60 seconds per user. The plan's `POST /api/config/flags/:key` spec calls `cache.del()` on the `node-cache` in-process cache — but this only clears the NODE-PROCESS cache. The HTTP `Cache-Control: private` prevents the HTTP cache from being busted (it's a browser cache, not a CDN — no purge API). The localStorage cache has its own TTL.

**Maximum delay for kill-switch to take effect:** 60s (HTTP) + localStorage TTL (unspecified, potentially another 60s) = up to 120 seconds. For a production incident this is unacceptable.

**Mitigation required:**
1. On a successful `POST /api/config/flags/:key`, return a `Cache-Bust-Token` header or use a cache-busting query parameter in the `GET` URL (e.g., `?v={timestamp}`) so the browser's HTTP cache is bypassed.
2. Alternatively, send `Cache-Control: no-store` on the flags endpoint (rely on localStorage TTL only) and have the FE use a short 30-second localStorage TTL.
3. The FE should expose a `refreshFlags()` function callable from the admin UI or from a broadcast channel message.

---

### C3 — Fail-closed: `false` is wrong safe default for some flags — MEDIUM

**Finding:** `adaptive.cors.mobile` defaults to `false` — correct, more restrictive is safer. All Phase 1 flags default to `false` — this is appropriate since they all enable NEW behavior. This concern is LOW for Phase 1 specifically.

**The future risk (document now):** In future phases, someone may add a flag like `adaptive.security.strict_csp = true` where the safe default is `true` (permissive CSP is the risk). If they follow the pattern and default to `false`, they've just shipped with a permissive CSP. The architecture has no mechanism to declare a "fail-open" flag (one where `false` is the dangerous state).

**Mitigation required:** Add to the `sv_feature_flags` schema: a `safe_default` JSONB column that specifies the failsafe value (not always `false`). Document this in the Phase 1 migration and the flag creation guide.

---

### C4 — App boots, components read flag before fetch resolves — HIGH

**Finding:** The FE spec (`02-fe-architecture.md §7`) says: "Bootstrap: `App.tsx` calls `useFlagStore.getState().fetchFlags()` once inside the `gate === 'authed'` effect." This means:
1. App mounts
2. Auth check runs
3. If `gate === 'authed'`, `fetchFlags()` is called
4. `fetchFlags()` is async — it awaits the localStorage check and possibly a network fetch (3s timeout)

Between steps 1–4, `InputModeProvider` has already mounted and components are rendering. Any component that calls `useFeatureFlag('adaptive.player.tap_toggle')` in this window gets `false` (the Zustand initial state: `flags: {}`). This is CORRECT — fail-closed is the right behavior for the first render.

**The actual problem:** If localStorage has a cached value from a previous session, `fetchFlags()` sets `loaded: true` synchronously from localStorage cache (before the network fetch). In this case, the flags are available immediately and there is NO loading state issue.

If localStorage is empty (first load, private browsing), `loaded: false` during the network fetch. Components checking `useFeatureFlag(x)` return `false`. This is correct fail-closed behavior.

**Verdict:** The plan handles this correctly via fail-closed defaults. The concern about flicker is real but the flicker is: "flags disabled → still disabled" since Phase 1 ships everything with flags = false. Zero visible change. LOW severity for Phase 1.

**Future risk (Phase 2+):** When flags are turned ON in prod, a first-load user will see a brief flash of the old layout before the flag fetch completes and React re-renders. This needs a loading state or SSR flag injection in future phases.

---

### C5 — Typo'd flag name silently returns false — LOW

**Finding:** `useFeatureFlag('adaptive.player.tap_toglle')` (typo) returns `false` (from `get().flags[name] ?? false`). No error, no warning. The feature silently stays off. Developer thinks it's disabled by the flag, doesn't investigate, ships broken code.

**Mitigation:** The spec already defines the flag names as a TypeScript enum or type. Enforce it: make the `useFeatureFlag` hook's `name` parameter typed to `keyof FlagMap` rather than `string`. This gives a compile-time error on typos. Add to the implementation spec.

---

## D. Mobile Gesture Failure Modes

### D1 — Tap on gesture surface AND control button simultaneously — HIGH

**Finding:** `PlayerGestureLayer` listens for `pointerup` on the full video area. The `PlayerControls` play button also listens for `click`/`pointerup`. On a small phone screen, a tap near the play button will:
1. Fire `pointerup` on `PlayerGestureLayer` (because it covers the entire video area)
2. Fire `click` on the play button (bubbles up through the component tree)

Both fire in sequence. Result: controls are toggled AND play/pause is toggled. Net effect: controls showed up for 200ms then hid, AND the video paused. From the user's perspective: tap on play = video pauses AND controls disappear. Catastrophic UX for Phase 1's only visible behavior.

**Reproduction:** Set `adaptive.player.tap_toggle = true`. Open player on mobile. Tap anywhere in the bottom third of the video (where controls are visible and the play button is visible). Controls hide AND video pauses simultaneously.

**Mitigation required:** `PlayerGestureLayer` must call `e.stopPropagation()` on the `pointerup` event to prevent it from reaching child controls. BUT: this would break ALL child interactions. Correct fix: `PlayerGestureLayer` registers tap on the BACKGROUND layer only (the non-control area). Detect if the tap target is a control element: `if (e.target instanceof Element && e.target.closest('[data-player-control]')) return;`. Add `data-player-control` attribute to all control buttons.

---

### D2 — Double-tap within animation duration causes state thrash — MEDIUM

**Finding:** Single tap = show/hide controls. The spec (`06-qa-matrix.md §3.2`) says the G1 test taps twice with a 400ms gap. If animation duration for show/hide is 200ms and user taps at 150ms (during animation), the second tap fires on the still-animating state. The control visibility toggle may apply to the pre-animation state (visible=true) before the CSS transition completes. Result: two rapid taps could leave controls in an inconsistent state (CSS says hidden, React state says visible).

**Mitigation required:** Use a `isBusy` ref in `PlayerGestureLayer` that is set to `true` during the show/hide animation (duration: X ms) and ignores taps during that window. This is the standard debounce pattern for UI animations.

---

### D3 — PR-FE-2 ships with flag default false — how do we test? — MEDIUM

**Finding:** The plan correctly ships the tap-toggle behavior behind `adaptive.player.tap_toggle = false`. The Playwright test (`e2e/mobile-tap-toggle.spec.ts`) presumably sets the flag to `true` for the test user before testing. But: how? The test needs to either (a) directly update the DB before the test, (b) call the admin API endpoint to flip the flag, or (c) use a VITE env override.

The plan doesn't specify how E2E tests flip feature flags. If (b), the test needs an admin API endpoint AND a valid admin session. If (a), the test needs DB access from within GitHub Actions (which runs against the LIVE app, based on the prod-facing test config). If (c), environment-based overrides bypass the DB entirely and don't test the flag infrastructure.

**Mitigation required:** The E2E test spec must explicitly document the flag-setting mechanism. Recommended: use a dedicated test fixture that calls `POST /api/config/flags/adaptive.player.tap_toggle` with admin credentials before the test, and restores the original value after. The admin credentials must be available as CI secrets.

---

### D4 — iOS Safari synthesizes click after touchend — HIGH

**Finding:** iOS Safari fires `touchstart → touchend → mousemove → mousedown → mouseup → click` after a touch tap. The `PlayerGestureLayer` listening to `pointerup` (or `touchend`) will fire the tap-toggle. Then iOS Safari fires a synthetic `click` on the element ~300ms later. If a control button is under the tap, the synthetic click fires on it.

The plan acknowledges "Playwright touch ≠ real iOS Safari" as a documented gap (A10 in master plan). But the specific synthetic-click behavior has a concrete consequence for Phase 1: the tap-toggle fires correctly, then 300ms later a synthetic click may toggle play/pause if the tap landed over a control area.

**Reproduction:** On real iPhone Safari, set flag to true, open player, tap anywhere on the video area. Controls appear. 300ms later a synthetic click fires on whatever element is under the tap target — if it's the video element itself, `HTMLVideoElement.click()` fires play/pause. Video pauses. User is confused.

**Mitigation required:** In `PlayerGestureLayer`, call `e.preventDefault()` on `touchend` to suppress the 300ms synthetic click. This is standard practice for mobile gesture layers. Add to the implementation spec explicitly. Note: this is NOT caught by Playwright touch emulation (it doesn't synthesize the 300ms click).

---

## E. Preview URL Failure Modes

### E1 — Basic Auth password committed to git — CRITICAL

**Finding:** The preview stack is configured in `docker-compose.preview.yml`. The nginx-proxy-manager Basic Auth is configured "in the npm UI" — so the password is NOT in git. However, `bin/streamvault-preview-up.sh` and `bin/streamvault-preview-down.sh` are new files being committed. If an agent implementing PR-OPS-2 adds `--basic-auth user:password` to an nginx command in one of these scripts, it's in git.

More likely: the `VITE_API_URL` in `docker-compose.preview.yml` is hardcoded to an internal URL — that's fine, not a secret. The JWT secrets and Xtream credentials are passed via environment variables from the VPS's `.env` file — not hardcoded. This architecture is CORRECT.

**The actual risk:** The `docker-compose.preview.yml` references `${SV_JWT_SECRET}`, `${SV_XTREAM_PASSWORD}`, etc. These are expanded from the VPS shell environment when `docker compose up` is run. If the agent implementing PR-OPS-2 accidentally hardcodes any of these (copy-paste from the running container's env), it ends up in git.

**Mitigation required:** The PR gate for PR-OPS-2 must include a secret-scan step. The existing `validate.yml` includes a secret-scan step already. Verify it runs on the backend repo's `v3-adaptive/preview-url` branch.

---

### E2 — Preview stack on same VPS as prod spikes memory and OOM-kills prod — HIGH

**Finding:** The VPS runs `streamvault_api` at 768 MB RAM limit. The preview API container has no explicit memory limit in the docker-compose spec shown in `04-rollback-and-flags.md §5`. If PR-OPS-2 is implemented without a memory limit on the preview containers, a preview smoke that hammers the API (e.g., loading all channels, EPG bulk) could spike to 768+ MB and the OOM killer may kill either the preview container or the prod container.

**Reproduction:** CI preview smoke for a large PR builds and starts the preview stack. The preview BE starts loading the full Xtream catalog into its in-process cache on startup (existing behavior). Memory spikes to 600 MB+ for the preview API. Simultaneously, prod API is handling a real user request. Total memory: 768 (prod) + 600 (preview) = 1368 MB, well over typical VPS RAM. OOM killer evicts one of them.

**Mitigation required:** Add `mem_limit: 512m` to both preview containers in `docker-compose.preview.yml`. The preview smoke does not need full catalog preloading. Also: run preview smoke sequentially after confirming prod health, and shut down preview containers immediately after smoke completes (the spec says `restart: "no"` which is correct, but the smoke script also needs to explicitly stop them).

---

### E3 — Preview DB shares prod data — HIGH

**Finding:** The spec (04-rollback-and-flags.md §5) says: "Preview API uses separate env `SV_SCHEMA_PREFIX=sv_preview_` so it reads/writes different tables (requires small BE change to respect the prefix; fallback: use a separate `streamvault_preview` DB created for preview only)."

The phrase "requires small BE change to respect the prefix" is a hand-wave. The current BE codebase has NO concept of `SV_SCHEMA_PREFIX`. Every query is hardcoded to `sv_*` table names (e.g., `SELECT * FROM sv_users WHERE ...`). Making the entire BE respect a runtime schema prefix requires changing EVERY query — approximately 60+ SQL queries across 13 routers and 5 services.

**If this BE change is NOT implemented for Phase 1:** The preview API connects to the SAME Postgres DB and reads/writes the SAME `sv_*` tables as prod. A preview deploy that runs a bad migration, or a smoke test that creates test data, directly pollutes prod data.

**Mitigation required:**
1. This is NOT a "small BE change." Either (a) create a completely separate `streamvault_preview` Postgres database (different DB, same Postgres instance), seed it with sanitized test data, and point the preview API's `POSTGRES_DB` env var at it; or (b) scope Phase 1's preview stack to READ-ONLY operations only (no write endpoints in the preview smoke, which is trivially achievable by only testing GET endpoints).
2. Mark this as BLOCKING for PR-OPS-2: the preview stack must either use a separate DB or be confirmed read-only.

---

### E4 — Preview passes, prod fails on prod-specific data shapes — MEDIUM

**Finding:** The preview stack uses preview/test data. The prod stack serves real Xtream data where categories, channels, and EPG entries have real-world quirks (unicode channel names, extra-long EPG descriptions, null fields the spec didn't anticipate). A preview smoke that passes against clean test data may mask bugs that only surface with real prod data.

**This is acknowledged** in the master plan (A10) as a known gap. The user validation gate covers this. **No additional mitigation needed for Phase 1 beyond what's documented.**

---

## F. TV Sacred Promise Failure Modes

### F1 — Snapshot test is not stable due to dynamic content — HIGH

**Finding:** The TV-snapshot test is described as a pixel-lock against current TV behavior. But the TV UI has DYNAMIC content:
- The BottomDock clock ticks every second (if implemented — checking: `src/nav/BottomDock.tsx` per the existing codebase context)
- EPG now/next data changes every few minutes
- Live channel thumbnails may update
- The "currently watching" rail shows recent watch history

A pixel-lock snapshot of a page with a clock would fail on every CI run where the clock second changed between baseline capture and test run.

**Mitigation required:** The TV-snapshot test must either:
1. Mock `Date.now()` and clock displays before taking the snapshot (use Playwright's `page.addInitScript(() => Date.now = () => 1714500000000)`)
2. Use the existing `visual-polish.spec.ts` approach which presumably already handles dynamic content (worth checking)
3. Limit the snapshot to a STATIC portion of the UI (e.g., the dock navigation without the EPG content area)

The plan assumes this is solved but doesn't specify HOW the snapshot is made stable. This must be in the implementation spec for `e2e/tv-snapshot.spec.ts`.

---

### F2 — Bundle budget: 213 KB TV estimate may be stale — MEDIUM

**Finding:** The master plan states "TV initial 213 KB gz (current)." The plan doc says this is a "current" measurement, but:
1. The 02-fe-architecture.md says "player chunk currently sits at ~130 KB gz (estimate)" — it's an ESTIMATE, not a measured value.
2. The Vite config may change when new dependencies (`@use-gesture/react`) are added, affecting chunk splitting strategy and potentially moving code into the TV initial chunk.
3. `InputModeProvider` and `featureFlags.ts` ARE in the initial chunk (they wrap the app in `main.tsx`). These add ~350 LOC. Even if they're small, any accidental import of a heavy dependency would inflate the TV bundle.

**Mitigation required:** Run `npm run build` on the CURRENT main branch (before any Phase 1 changes) and measure the actual TV bundle size. Lock this as the baseline in `scripts/check-bundle-budget.js`. The CI gate should use the MEASURED baseline, not the estimated one.

---

### F3 — InputModeProvider runtime error crashes the entire app on Silk — CRITICAL

**Finding:** `InputModeProvider` is added to `main.tsx` wrapping `<App>`. If it throws on Silk's older browser (WebKit-based, partial ES2020 support), the entire app fails to mount. There is no error boundary around it.

**Reproduction:** `InputModeProvider` uses `window.matchMedia('(pointer: coarse)').addEventListener('change', ...)`. On older Silk versions, `MediaQueryList.addEventListener` may not be supported (it was added in Chrome 45). Silk on 1st-gen Fire TV Sticks uses an older engine. The `.addEventListener` call throws `TypeError: not a function`. `set -euo pipefail` on the JS side means the entire React tree fails to mount.

**Mitigation required:**
1. Wrap `InputModeProvider` in an ErrorBoundary in `main.tsx`
2. Guard the `MediaQueryList.addEventListener` call: `if (mq.addEventListener) { mq.addEventListener('change', handler) } else if (mq.addListener) { mq.addListener(handler) }` (the deprecated `addListener` is supported on older browsers)
3. The `src/nav/SilkProbe.ts` already detects Fire TV UA — use it to skip `pointer: coarse` detection entirely when `isTV` is true at boot

---

### F4 — UA detection failure: wrong platform mode on Silk — HIGH

**Finding:** The `data-tv="true"` UA sniff in `main.tsx` matches `AFT` in the user agent string (Amazon Fire TV). The spec correctly identifies this as the authoritative TV detection. `InputModeProvider` reads `document.documentElement.dataset.tv === 'true'` synchronously.

**Risk:** If Amazon ever changes the Silk UA string (unlikely but not impossible — they changed it in 2022 for some devices), `data-tv` is never set, `isTV` is false, and the new mobile/desktop paths MOUNT on TV. The `InputModeProvider` then detects `pointer: coarse` (TV remotes are coarse) and sets `touch` mode. `PlayerGestureLayer` mounts (because `isTV === false`). Gesture handlers consume TV pointer events that Silk generates during d-pad navigation.

**Mitigation:** The existing `SilkProbe.ts` should be the SINGLE source of truth for TV detection. Add a secondary check in `InputModeProvider`: if Silk Probing detects Fire TV (even without the UA string match), force `isTV = true`. This dual-check is belt-and-suspenders against UA string changes.

---

## G. Subagent + Auto-Orchestration Failure Modes

### G1 — Agent runs out of context mid-PR, writes incomplete code — HIGH

**Finding:** A sonnet agent implementing PR-FE-1 (~600 LOC estimate) is given the full master plan, both FE and BE specs, and the existing codebase to read. With 200K context, this is feasible. However, if the agent reads too many existing files (e.g., all 46 test files + all router files + all spec files), context fills before writing the implementation.

**Symptoms of incomplete code that still passes tests:** The agent writes `InputModeProvider.tsx` but skips the `MediaQueryList` watcher (not tested by the unit tests). The component works for the initial render but never updates when the user picks up a mouse. Tests pass (they test initial state only). CI is green. PR merges. Bug is in prod.

**Mitigation required:** Each implementation agent must be given a bounded context budget: read ONLY the spec files relevant to their PR + the specific existing files they'll modify (listed explicitly in the PR spec). The orchestrator must NOT pass the full master plan + all 6 specs to each agent — only the relevant subset.

---

### G2 — Subagent permissions: destructive command during migration test — HIGH

**Finding:** Per memory feedback: "Subagents don't inherit main-session approvals — widen settings.local.json allowlist; dangerouslyDisableSandbox doesn't fix permissions."

PR-BE-1 needs to run an integration test against a running Postgres container (`npm run test:integration`). The integration test likely calls `docker exec postgres psql -U ... -c "DROP TABLE IF EXISTS sv_feature_flags"` to clean up between runs. If this command is not in the allowlist, the integration test fails silently (the agent's tool call is rejected, the test reports "container not found" or similar non-obvious error), and the agent assumes the test passed without actually running it.

**Reproduction:** Agent implements `config.router.test.ts`. Runs `npm test` — unit tests pass (they mock Postgres). Tries to run integration test that needs real Postgres via `docker exec` — permission denied. Agent reports "tests pass" without running integration tests. PR merges. The feature-flag DB schema may have bugs only caught by integration tests.

**Mitigation required:** Before starting implementation, the orchestrator must verify that the settings.local.json allowlist includes at minimum: `docker exec postgres psql`, `docker compose up`, `docker compose stop`. Do this as a pre-flight check step before spawning implementation agents.

---

### G3 — Token exhaustion: no watchdog mechanism — MEDIUM

**Finding:** The plan says "hard-stop on token exhaustion" but there is no watchdog mechanism described. The orchestrator doesn't know its own token count. The user is away. If token exhaustion happens mid-PR implementation, the agent stops writing, the PR is opened with incomplete code (or not opened at all), and the status report is never written.

**Mitigation:** The orchestrator should write a progress checkpoint file after each major milestone (after each PR is merged, not just after all PRs). If the session is cut short, the user returns to a checkpoint file showing exactly where things stopped. The plan's status report (`claude/status/streamvault-v2-progress.md`) should be written incrementally, not only at the end.

---

### G4 — Network outage mid-implementation: broken PR opened — MEDIUM

**Finding:** The CI gate will catch broken code (lint + typecheck + tests). A PR with incomplete code will fail CI and NOT auto-merge. This is actually the correct safety net — broken PRs sit open and don't deploy.

**The issue:** A partially implemented PR blocks the dependency chain. PR-FE-2 (tap-toggle) depends on PR-FE-1 (InputModeProvider). If PR-FE-1 is opened but CI-failing (due to incomplete code), PR-FE-2 can't be based on it. The agent may then base PR-FE-2 on main directly (skipping the foundation) and the test suite diverges.

**Mitigation required:** Each PR branch should be based on the PREVIOUS merged PR's merge commit, not on the previous PR's branch. The orchestrator must wait for each PR to merge before starting the next. If a PR fails CI, the orchestrator must fix it before proceeding.

---

## H. Other Concerns

### H1 — gh pr create rate limits — LOW

**Finding:** GitHub's API allows 5,000 requests/hour per token. 5 PRs in one session is well under any limit. The secondary rate limit (60 requests per minute for REST) is also not a concern. **No risk here.**

---

### H2 — Two PRs merge simultaneously; deploys race; snapshot gets overwritten — HIGH

**Finding:** The `DEPLOY_ID` is generated as `$(date -u +%Y%m%d-%H%M)`. If two deploys start in the same minute (e.g., PR-BE-1 and PR-OPS-1 merge close together and both trigger their `deploy.yml`), both get the SAME deploy ID (same timestamp). `bin/streamvault-snapshot.sh` would write to the same `{DEPLOY_ID}.dump` and `{DEPLOY_ID}.manifest.json` files, with the second deploy overwriting the first's snapshot. The manifest would then be inconsistent (wrong sha256 for the dump it overwrote).

**Reproduction:** PR-BE-1 and PR-OPS-1 both merge within the same UTC minute. Both `deploy.yml` runs start. Both call `streamvault-deploy.sh`. Both generate `DEPLOY_ID = "20260429-1430-..."`. Second run overwrites the first's snapshot at minute 14:30. The manifest sha256 now belongs to the second dump but the FE image tag still points to the first deployment.

**Mitigation required:** Add the 7-char git SHA of BOTH repos to the deploy ID, making it collision-resistant:
```bash
DEPLOY_ID="$(date -u +%Y%m%d-%H%M%S)-$(git -C ~/streamvault-backend rev-parse --short=7 HEAD)-$(git -C ~/streamvault-v3-frontend rev-parse --short=7 HEAD)"
```
Adding `%S` (seconds) to the timestamp plus dual SHAs makes collision essentially impossible.

---

### H3 — Transitive dependency billing audit — LOW

**Finding:** The plan says "No paid services." `@use-gesture/react` is Apache-2.0 licensed OSS — no billing. Its dependencies (`@use-gesture/core`, `react`) are also OSS. No SaaS entanglement.

The preview stack adds nginx-proxy-manager (MIT licensed, self-hosted) and potential Let's Encrypt cert provisioning (free). No paid services introduced.

**Verdict:** No billing risk. The concern is not applicable to Phase 1.

---

### H4 — Status report may be wrong — MEDIUM

**Finding:** The plan says the orchestrator writes a status report to `.claude/status/streamvault-v2-progress.md` (note: the filename says "v2" — probably a typo, should be "v3"). The status report's accuracy depends on the orchestrator correctly tracking which PRs merged and which failed.

**Risk:** The orchestrator reports "PR-FE-2 merged" but the PR actually failed CI and is sitting open. User returns, sees green status report, doesn't check GitHub, flips the feature flag in prod, gets an error because the code never deployed.

**Mitigation required:**
1. The status report MUST include: PR URLs, not just PR names. User can click through to verify.
2. For each PR, include the merge commit SHA (from `git log`) so the user can verify `git log --oneline` on main matches.
3. Write the status report by READING GitHub PR state via `gh pr list --state all` rather than from memory.

---

## Top 10 Ranked Failure Modes

| Rank | Severity | Category | 1-line reproduction | 1-line fix |
|------|----------|----------|--------------------|-----------:|
| 1 | CRITICAL | A7 | Rollback restores DB with `adaptive.gestures.enabled=true`, re-enabling the broken feature you just kill-switched off | Exclude `sv_feature_flags` from pg_dump scope; restore flags from manifest JSON separately |
| 2 | CRITICAL | A4 | Two rollback scripts exist with different snapshot dirs and dump formats; operator runs wrong one in prod | Delete 03-be-architecture.md §3 rollback script; 04-rollback-and-flags.md is the single canonical rollback spec |
| 3 | CRITICAL | F3 | `MediaQueryList.addEventListener` throws on older Silk devices; `InputModeProvider` crashes; entire app fails to mount on TV | Wrap in ErrorBoundary + guard with `if (mq.addEventListener)` else `mq.addListener` fallback |
| 4 | CRITICAL | A1 | OOM kills pg_restore after DROP; tables gone; re-run fails with "relation already exists" | Use `pg_restore --single-transaction --exit-on-error` inside a Postgres-level transaction |
| 5 | HIGH | D1 | Tap on play button fires both `PlayerGestureLayer` toggle AND `click` on button; controls hide AND video pauses simultaneously | Add `if (e.target.closest('[data-player-control]')) return;` guard in gesture handler |
| 6 | HIGH | D4 | iOS Safari 300ms synthetic click fires after touchend, toggling play/pause after tap-to-toggle | Call `e.preventDefault()` on `touchend` in PlayerGestureLayer to suppress synthetic click |
| 7 | HIGH | E3 | Preview API writes to SAME `sv_*` tables as prod; preview smoke test creates/corrupts real user data | Use separate `streamvault_preview` Postgres DB for preview stack; do NOT rely on schema prefix workaround |
| 8 | HIGH | H2 | Two deploys start in same UTC minute; same `DEPLOY_ID` generated; second overwrites first's snapshot; manifest sha256 invalid | Add `%S` (seconds) and both repo SHAs to `DEPLOY_ID` to prevent collision |
| 9 | HIGH | C2 | Operator flips flag to false in DB; 60s HTTP cache + localStorage TTL means kill-switch takes up to 120s to take effect | Return `Cache-Control: no-store` on flags endpoint; rely on short localStorage TTL only |
| 10 | HIGH | A5 | `docker system prune` or disk-pressure cleanup deletes tagged snapshot Docker images; rollback fails with no recovery path | Protect last 5 `smoke_passed=true` deploy-tagged images from pruning; add rebuild-from-archive fallback |

---

## Overall Verdict

**NEEDS-REWORK** before implementation starts.

The plan is thorough and well-structured, but has 4 CRITICAL issues that would cause production outages or silently defeat the rollback system:
1. The kill-switch + rollback interaction is broken by design (A7)
2. Two conflicting rollback script implementations exist (A4)
3. `InputModeProvider` can crash Fire TV cold-start (F3)
4. Non-transactional pg_restore leaves DB empty on failure (A1)

None of these are hard to fix — they're each 10–30 lines of changes to the specs. Fix these four before implementation begins. The HIGH items (especially D1/D4 gesture event propagation, E3 preview DB isolation, and H2 deploy ID collision) should also be resolved in the spec before agents implement.

Estimated spec revision effort: 2–3 hours.

**Report path:** `/home/crawler/streamvault-v3-frontend/.claude/plans/v3-adaptive/grill-report.md`
