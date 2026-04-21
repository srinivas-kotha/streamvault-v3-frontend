# StreamVault v3 — Known Risks

## KR-01: WAN performance unverified

TTFF targets apply to LAN fixture only (80ms RTT, 20 Mbps, 4× CPU throttle).
Off-LAN deployments should expect TTFF ≥ 4s.
Status: post-MVP. Tracked as v3.1 performance work.

## KR-02: Fire Stick real-device smoke

All perf testing is throttled Chrome until hardware acquired.
If Fire Stick 4K Max not acquired before MVP tag: this entry blocks v3.1 release.
Status: user plans to buy before MVP release.

## KR-03: (reserved — intentionally skipped)

Reserved in v3 plan sequence. No current risk attached.

## KR-04: Dual-HLS memory pressure on Fire TV 4K Max

Phase 5a.7 runs `useHlsPlayer` inside SplitGuide for a live preview alongside
the main PlayerPage `useHlsPlayer`. Fire TV 4K Max has ~1.5 GB app-accessible
RAM; two simultaneous hls.js instances + segment buffers can OOM.

Mitigation (architecture decision — single active player at a time, matching
Apple TV and Roku platform conventions):

1. SplitGuide preview uses `capLevelToPlayerSize: true` on its hls.js config
   to cap the preview rendition to the small preview panel size (not full 1080p).
2. A module-level `ActivePlayer` coordinator (simple React context) ensures
   the SplitGuide preview `.pause()`es whenever PlayerPage mounts, and resumes
   only after PlayerPage unmounts.
3. DoD gate in Task 5a.7 asserts the pause-on-PlayerPage-mount behaviour.

Status: mitigated at design time; verify on real Fire TV hardware in Phase 8
smoke checklist (alongside KR-02). If memory pressure still observed, fall back
to poster-only SplitGuide preview (revert Task 5a.7).

## KR-CHANGEPW: Phase 3 blocked — change-password endpoint missing

**Status (2026-04-21): 🔴 BLOCKING — Phase 3 cannot begin until backend PR lands.**

Plan Task 3.0 pre-check ran 2026-04-21 against `http://localhost:3001`:
- `POST /api/auth/change-password` → 403 "CSRF token mismatch" (placeholder token rejected)
- `GET /api/auth/change-password` → 501 "Not Implemented — coming in Phase 2/3"
- `grep -rn "change-password|changePassword" streamvault-backend/src/` → 0 hits

Per the v3 plan, Phase 3 cannot begin until a backend PR on `streamvault-backend` adds `POST /api/auth/change-password` with refresh-token purge. Estimate ~4h:

1. Route in `src/routers/auth.router.ts` — Zod-validate body, verify current password with bcrypt, hash new password, UPDATE `sv_users`, DELETE refresh-token rows for the user, return 204.
2. Auth middleware on the route (Bearer JWT).
3. CSRF token flow — current backend enforces CSRF on mutating endpoints (our probe confirmed 403 CSRF on POST even with an auth token placeholder). Either add a `GET /api/auth/csrf` endpoint that issues a token or document how the frontend fetches one before POSTing.
4. Unit test under `test/` or `tests/` covering: (a) wrong currentPassword → 401, (b) short newPassword → 422, (c) success → 204 + refresh tokens deleted, (d) CSRF missing → 403.

**Operational constraints** that extend the timeline:
- `streamvault-backend` CI workflows have been stuck red since 2026-03-14 (KR from plan context) — the backend PR will need the CI unblock or an agreed manual-deploy path (the 2026-04 jti fix used `docker compose up -d --build streamvault-api` as the manual fallback).
- Solo dev — backend PR + v3 Phase 3 unblock is a single-threaded dependency.

**Why this wasn't auto-fixed during the Phase 2 close session:** the session was running unattended, and building an auth-sensitive endpoint against a backend with broken CI is not the kind of change that should ship without live human review. The plan's Task 3.0 gate explicitly says "do not proceed; escalate" when the endpoint is missing.

**Resume plan:**
1. Write + merge `streamvault-backend` PR adding `POST /api/auth/change-password` (unblock CI first, or use the manual-deploy path).
2. Re-run the probe. Expect 401 / 422 (no auth / bad payload) on a valid CSRF token request.
3. Log the verification in `docs/DECISIONS.md` per plan Task 3.0, tick the plan checkbox, proceed to Task 3.1 Zod schemas.
