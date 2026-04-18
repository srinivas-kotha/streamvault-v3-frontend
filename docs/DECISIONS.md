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

Verified via Playwright screenshot `/tmp/typography-gate-1080p.png` rendered at 1920×1080 and reviewed in-session. All 6 type scales (Hero 48px/700, Title 32px/600, BodyLg 24px/500, Body 20px/400, Label 14px/500 uppercase+tracking, Caption 16px/400 tertiary) legible. Label at 14px is in-spec floor; letter-spacing + uppercase compensate. Caption tertiary 40% opacity is intentional low-priority tone.

Outcome: Inter Display kept as primary UI font. Roboto fallback NOT triggered.
