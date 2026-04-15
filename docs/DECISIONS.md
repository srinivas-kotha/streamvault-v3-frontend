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

Temporary password Test123 (from backend PR #37) confirmed as current prod admin password.
User-chosen. Flagged as weak plan-debt — rotate before v3 goes OSS/public.
Verified via POST /api/auth/login returning 200 with valid session cookies.

## 2026-04-15 — E2E test account (sv_e2e_test) deferred

sv_e2e_test account creation deferred to Task 3.0 pre-check window.
Reason: scripts/seed-user.js does not exist in streamvault-backend yet; creating it is
a separate backend PR not required until Phase 3 auth E2E tests run (weeks away).
Plan: create sv_e2e_test alongside any backend PR needed for change-password endpoint
confirmation. SV_TEST_USER=sv_e2e_test + SV_TEST_PASS documented in .env.example.
