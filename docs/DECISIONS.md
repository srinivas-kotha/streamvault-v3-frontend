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
