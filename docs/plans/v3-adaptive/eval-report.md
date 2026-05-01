# Phase Evaluator Report — StreamVault v3 Adaptive Responsive Layer
**Evaluator:** Claude Sonnet 4.6 (phase-evaluator role)
**Date:** 2026-04-29
**Plan evaluated:** `streamvault-v3-adaptive-responsive.md` + 6 expert specs
**Verdict:** **GO-WITH-FIXES** — 3 blockers require plan edits before implementation starts; 2 more require implementation-time decisions. No NO-GO conditions found, but blockers must not be skipped.

---

## 1. Scorecard Table

| # | User Requirement | Score (1–5) | Gap Summary |
|---|---|---|---|
| 1 | Adaptive layer on top, not rebuild | 5 | Fully addressed — every spec emphasizes additive-only, TV guards, feature flags |
| 2 | Archive old v2 repo + memory references | 2 | Master plan defers archive to post-Phase 1 (§7 R10); no migration checklist, no concrete steps, no timeline |
| 3 | Backend = separate repo "StreamVault Backend"; DB = Postgres on VPS | 5 | BE repo split is already live; plan correctly routes BE PRs there; shared-DB rationale is documented |
| 4 | Plan location chosen by orchestrator | 5 | Stored in `.claude/plans/`; referenced from both repos |
| 5 | PR + review + merge — never direct-to-main | 4 | PR workflow documented; auto-merge allowed per user directive while away — acceptable |
| 6 | Full SDLC autonomous: plan → eval → grill → implement → review → merge → deploy | 4 | Sequence in §10 is correct; missing: who triggers grill-me, what tool/agent, blocking vs non-blocking |
| 7 | Player gestures: tap, slide/drag, click, long-press = forward (YouTube-style) | 5 | All 9 gestures fully specified in 01-ux-spec §3; thresholds, zones, conflict resolution all present |
| 8 | Responsive desktop AND mobile, keep TV working | 5 | Four-tier breakpoint strategy, input-mode state machine, TV terminal guard all solid |
| 9 | Atomic rollback: FE + BE + DB together via single handle | 5 | `bin/streamvault-rollback.sh` covers all three layers; SHA-256 verification; idempotent; drill protocol documented |
| 10 | Backup + feature flags + DB safety = "all of the above" | 4 | All three present; flag-table/snapshot ordering gap (see BLOCKER-3) |
| 11 | Hard stop on token exhaustion or paid services | 2 | No mention anywhere in master plan or any spec; no circuit-breaker, no budget threshold, no paid-service enumeration |
| 12 | No physical-device testing acceptable | 5 | A10 locked architecture decision; QA §10 explicitly lists the gap and defers to user post-return |
| 13 | Token discipline: haiku reads / sonnet writes / opus orchestrates | 3 | §2 mentions it but there is no enforcement mechanism, no subagent role assignment, no settings.local.json widening for subagent permissions |

---

## 2. Cross-Spec Consistency Findings

### Conflict C-1: Feature flag key naming mismatch (BLOCKER)

| Spec | Flag key name |
|---|---|
| Master plan §5 PR-BE-1 | `adaptive.player.tap_toggle`, `adaptive.mobile.enabled`, `adaptive.desktop.enabled`, `adaptive.gestures.enabled` |
| 03-be-architecture §2b | `adaptive.mobile.enabled`, `adaptive.gestures.enabled`, `adaptive.pagination.live`, `adaptive.pagination.vod`, `adaptive.cors.mobile` |
| 02-fe-architecture §7.1 | `adaptive_responsive`, `desktop_side_nav`, `mobile_gestures`, `desktop_scrubber`, `mobile_player_gestures`, `desktop_top_bar`, `container_queries` |

Three different naming conventions (`adaptive.player.tap_toggle` vs `adaptive_responsive` vs `desktop_side_nav`) across the three documents. The FE client will fail to read the BE flags because the key strings do not match. This must be resolved to a canonical set before PR-BE-1 is written.

### Conflict C-2: Feature flag storage location mismatch (BLOCKER)

| Spec | Storage |
|---|---|
| 03-be-architecture §2a | Dedicated `sv_feature_flags` table (new migration 05-feature-flags.sql) |
| 04-rollback-and-flags §6 | `sv_settings` table (already exists), JSON blob at key `feature_flags` |
| 02-fe-architecture §9 | "flags are a single JSON blob in `sv_settings`" |
| 05-product-scope FR-10 | "reads from `sv_settings` row key = `feature_flags`" |

The BE architecture spec creates a proper relational `sv_feature_flags` table. Three other specs assume a JSON blob in the existing `sv_settings` table. These are architecturally incompatible. The migration SQL in 03-be creates a table that the other four specs do not reference. Implementer will get a broken endpoint if they follow any one spec in isolation.

**Recommendation:** Adopt the `sv_feature_flags` table from 03-be (correct design), update 04-rollback, 05-product-scope, and 02-fe-architecture to reference it. The GET endpoint shape is the same either way.

### Conflict C-3: Snapshot retention policy mismatch

| Spec | Retention |
|---|---|
| Master plan §5 PR-OPS-1 | 14 days OR last 5 `smoke_passed: true`, whichever is longer |
| 03-be-architecture §3a | 10 snapshots (count only, no age) |
| 04-rollback-and-flags §2d | 14 days + last 5 smoke_passed, prune script provided |

The 03-be spec says "keep last 10 snapshots" while master plan and 04-rollback both say "14 days + last 5 smoke_passed". Minor inconsistency but implementer should use the 04-rollback spec (most detailed, has actual prune script).

### Conflict C-4: `bin/` script naming and location

| Spec | Script name |
|---|---|
| Master plan §5 PR-OPS-1 | `bin/streamvault-snapshot.sh`, `bin/streamvault-deploy.sh`, `bin/streamvault-rollback.sh`, `bin/streamvault-drill.sh` |
| 03-be-architecture §3a | `bin/snapshot.sh`, `bin/rollback.sh` |
| 04-rollback-and-flags §3 | `bin/streamvault-rollback.sh`, `bin/streamvault-snapshot.sh`, `bin/streamvault-deploy.sh`, `bin/streamvault-prune-snapshots.sh` |

03-be uses short names (`bin/snapshot.sh`) while master plan and 04-rollback use prefixed names (`bin/streamvault-snapshot.sh`). The CI `deploy.yml` references in 04-rollback call `bin/streamvault-deploy.sh`. If 03-be's short names are implemented, CI will fail.

**Recommendation:** Use the prefixed names from master plan and 04-rollback everywhere. Delete the short-name references in 03-be.

### Conflict C-5: FE Phase numbering vs master plan Phase roadmap

The master plan uses a 6-phase roadmap (Phase 1–6) for the overall project. The `02-fe-architecture` spec defines its own internal phases 0–7 that do NOT map 1:1 to the master plan phases:

| Master plan Phase | 02-fe-architecture phases |
|---|---|
| Phase 1 Foundation | FE Phase 0 + FE Phase 1 + FE Phase 2 (partial) |
| Phase 2 Desktop layer | FE Phase 3 + FE Phase 4 |
| Phase 3 Mobile gestures | FE Phase 5 |
| Phase 4 Mobile chrome | FE Phase 6 |

The `05-product-scope` further remaps: Phase 2 in product scope includes US-002 (mobile safe-area dock), US-006 (desktop scrubber), US-007 (click-to-play), US-010 (touch targets) — but 02-fe puts touch targets in FE Phase 6 and safe-area in FE Phase 6. This creates confusion if implementers follow different specs for sequencing.

**Recommendation:** Add a cross-reference table to master plan §5 mapping PR names to the relevant FE phase numbers.

### Conflict C-6: norigin initialization strategy

| Spec | Strategy |
|---|---|
| 01-ux-spec §OD6 | Initialize norigin with `shouldFocusDOMNode: true` only when `data-tv="true"`; non-TV uses standard DOM tab order without norigin |
| 02-fe-architecture §4.1 | norigin MUST NOT be disabled on `mode === 'mouse'`; stays active always on all platforms; mouse/touch use React onClick/gesture hooks in parallel |

These are contradictory approaches to norigin lifecycle. 01-ux says "disable norigin for non-TV" while 02-fe says "never disable norigin". The 02-fe rationale is stronger (norigin has no teardown API in v2.1.0) but 01-ux's OD6 shows a code snippet that would break TV if norigin isn't initialized properly. **This must be resolved before any norigin-touching code ships.**

### Conflict C-7: InputMode type definition

| Spec | Types |
|---|---|
| 01-ux-spec §2.1 | `"dpad" | "keyboard" | "mouse" | "touch"` (4 modes, dpad is a mode) |
| 02-fe-architecture §4.1 | `'keyboard' | 'mouse' | 'touch'` (3 modes) + separate `PlatformHint = 'tv' | 'desktop' | 'mobile'` |

The 01-ux spec treats `dpad` as a mode. The 02-fe spec promotes TV platform to a separate `isTV` boolean and removes `dpad` from the mode type. These produce different API shapes. The 02-fe approach (separate `isTV`) is architecturally cleaner and avoids conflating input device with platform. **Master plan should canonicalize the 02-fe type.**

### Conflict C-8: Deploy ID format

| Spec | Format |
|---|---|
| Master plan §5 PR-OPS-1 | `deploy-202604291700-abc1234-def5678` |
| 03-be-architecture §3b | `deploy-<YYYYMMDDHHmm>-<FE-sha7>-<BE-sha7>` |
| 04-rollback-and-flags §2a | `YYYYMMDD-HHmm-{7-char SHA}` (no `deploy-` prefix, only one SHA) |

Three different formats for deploy IDs. The rollback script in 04-rollback parses the SHA from the deploy ID using `grep -oP '[a-f0-9]{7}$'` — this pattern only works with the 04-rollback format (trailing 7-char hex). If implementers use master plan's `deploy-YYYYMMDD-sha1-sha2` format, the rollback SHA extraction will fail.

---

## 3. Definition of Done Critique

### Phase 1 DoD (Master Plan §8) — Assessment

| Criterion | Specific? | Measurable? | Time-bounded? | Verdict |
|---|---|---|---|---|
| All 5 Phase 1 PRs merged to main | Yes | Yes | No (no deadline) | Pass — time-bound not needed for an autonomous session |
| CI green on main for both repos (5 consecutive runs) | Yes | Yes (5 runs) | No | Pass |
| Rollback drill executed and passed | Yes | Yes | No | Pass |
| `tv-snapshot.spec.ts` baseline locked | Yes | Yes (CI-enforced) | No | Pass |
| `axe-core` 0 violations on 5 specific pages | Yes | Yes | No | Pass |
| Bundle budget: TV ≤ 213 KB gz, player ≤ 200 KB gz | AMBIGUOUS | Yes | No | **PROBLEM** — master plan says "≤ 213 KB gz" (current baseline), but 02-fe, 05-product-scope, and 06-qa all say "≤ 240 KB gz" (current + 30 KB budget). Which is the gate? |
| `GET /api/config/flags` returns Phase 1 seeds in production | Yes | Yes | No | Pass |
| Preview URL live at `preview.streamvault.srinivaskotha.uk` | Yes | Yes | No | Pass — but see BLOCKER-2 |
| `bin/streamvault-rollback.sh` runs against synthetic deploy-id | Yes | Yes | No | **WEAK** — "without errors" is pass/fail; should specify max elapsed time (≤5 min per NFR-07) |
| Status report written | Yes | Yes | No | Pass |

**User-validation gate inconsistency:** The DoD distinguishes "Phase 1 complete" from "Phase 1 accepted" via a user-validation gate. This is correct design, but the three user-validation items are stated as "BLOCKING for Phase 2 start" — meaning the autonomous session can complete Phase 1 without user testing. This is acceptable per the stated constraints (no physical-device testing), but the report should clearly state that Phase 2 autonomous start requires only the CI-automated gates, not the user-validation gate.

**Missing DoD item:** No criterion checks that the `v2` archive task was started or tracked (Requirement 2, score 2).

**Missing DoD item:** No criterion checks token discipline was observed (e.g., model used per subagent verified).

---

## 4. PR Sequence Validation

### Stated sequence in master plan
```
PR-BE-1  → feature flags table + endpoint
PR-OPS-1 → rollback infra
PR-OPS-2 → preview URL stack
PR-FE-1  → input-mode + feature flag client + rollback marker
PR-FE-2  → mobile tap-toggle
```

### Actual dependency graph

```
PR-BE-1 (no deps — standalone BE migration)
    │
    └── PR-OPS-1 (PARTIAL dep: deploy.yml needs config router to exist before
    │             smoke endpoint GET /api/config/flags is added to smoke checks)
    │
    └── PR-FE-1 (HARD dep: featureFlags.ts fetchFlags() calls /api/config/flags;
    │            if PR-BE-1 not merged and deployed first, fetchFlags() returns 401/404
    │            on every app boot in the preview stack, causing fail-closed behavior
    │            throughout Phase 1 testing. Technically safe due to fail-closed design,
    │            but confusing to debug. PR-BE-1 must be DEPLOYED not just merged.)
    │
    └── PR-FE-2 (HARD dep on PR-FE-1: uses useFeatureFlag('adaptive.player.tap_toggle')
                 which requires PR-FE-1's featureFlags.ts to exist)

PR-OPS-1 (can merge in parallel with PR-BE-1 — no code dependency,
          but rollback DRILL requires a real deployed state which needs
          at least PR-BE-1 deployed so the smoke endpoint is present)
    │
    └── PR-OPS-2 (soft dep: preview stack uses preview-api which needs
                  config router from PR-BE-1 to avoid immediate 404 on
                  the preview smoke script's flag check step)
```

### Dependency issues found

**Issue D-1 (BLOCKER):** The rollback drill (required before Phase 1 is "done") depends on PR-OPS-1 being merged AND PR-BE-1 being deployed (so the smoke endpoint `/api/config/flags` exists). The master plan sequence lists PR-OPS-1 before PR-BE-1 is even submitted. The drill cannot be executed until both are live. The correct order is:

```
1. PR-BE-1 → merge → deploy
2. PR-OPS-1 → merge (scripts now work; deploy.yml updated)
3. (now drill is possible)
4. PR-OPS-2 → merge → deploy
5. PR-FE-1 → merge → deploy
6. PR-FE-2 → merge → deploy
7. Run drill
```

**Issue D-2:** PR-OPS-2 introduces a `docker-compose.preview.yml` that references `SV_SCHEMA_PREFIX=sv_preview_` — but no BE code currently reads this env var. The 04-rollback spec acknowledges this: "requires small BE change to respect the prefix; fallback: use a separate `streamvault_preview` DB created for preview only." This fallback is never implemented. The preview stack will silently write to the LIVE `sv_*` tables if this is not resolved.

**Issue D-3:** Both FE PRs reference `@use-gesture/react` being added to `package.json` in the FE arch spec (Phase 4), but PR-FE-2 in the master plan already uses `PlayerGestureLayer.tsx` which presumably uses pointer events. If `@use-gesture/react` is NOT added in PR-FE-2, the gesture implementation must use raw pointer events — which is fine but the specs are inconsistent about this. The master plan §3 A1 lists `@use-gesture/react` as a locked architectural decision, implying it should be added in PR-FE-2. But 02-fe places it in FE Phase 4 (later). The `package.json` change must be assigned to exactly one PR.

**Issue D-4:** Auto-merge is declared eligible after CI is green. The memory note `feedback_auto-merge-needs-branch-protection.md` warns that `--auto merge fires without CI gate if no branch protection`. The plan does NOT verify that `required_status_checks` are configured on both repos. If branch protection is absent, an auto-merge on a lint-passing but functionally broken PR could merge and deploy immediately.

---

## 5. Budget, Perf, Security, A11y Numbers

### Bundle budget (CONFLICT — see also C-1)

| Source | TV initial chunk budget |
|---|---|
| Master plan §5 PR-FE-1 | ≤ 213 KB gz ("current" + 0 KB delta) |
| 02-fe-architecture §budget | ≤ 213 KB gz + 30 KB = 243 KB |
| 05-product-scope NFR-01 | ≤ 243 KB gz |
| 06-qa-matrix §6.1 | ≤ 240 KB gz |

Three different ceiling numbers (213 / 240 / 243). The CI gate will be written against one of these. If written against 213, every PR that adds any code will fail immediately. Recommend: 240 KB gz (round number, matches QA spec).

### Perf budgets — specific and measurable

| Metric | Spec | Verdict |
|---|---|---|
| TV TTI (4G throttled) | ≤ 4.0s (05-product-scope NFR-03) | Specific; measured by existing harness |
| Mobile TTI (4G throttled) | ≤ 5.5s (05-product-scope NFR-04) | Specific; measured by existing harness |
| Gesture response latency | ≤ 100ms (NFR-08) | Specific; but NOT in CI — Playwright synthetic touch has no latency |
| Feature flag fetch p95 | ≤ 200ms (NFR-10) | Specific; but measurement method is "existing /health endpoint" which does not test /api/config/flags independently |
| Lighthouse thresholds | LCP/TBT/CLS/TTI per surface (06-qa §6.2) | Specific but advisory (non-blocking in PR CI) — acceptable |
| `data-input-mode` flip cost | ≤ 16ms (06-qa §6.3) | Specific; good |

### Security

The plan specifies `security-review skill` runs on every PR. However:
- No specification of what constitutes a "pass" from the security review
- No documented CVE scan for `@use-gesture/react ^10.x` before adding it as a dependency
- No mention of secret rotation during rollback (if `JWT_SECRET` needs rotation, rollback restores old tokens which may have been revoked)
- No SSRF check on the preview stack (preview API inherits all Xtream credentials from `.env`)

### Accessibility

- axe-core 0 violations is specific and measurable — good
- WCAG 2.2 AA is explicitly targeted — good
- Player ARIA roles fully specified in 01-ux §7.3 — good
- **Gap:** Player page is explicitly EXEMPTED from full-page axe scan in 06-qa §5.1 ("known false positives in axe-core"). The player is a primary user surface with complex gesture interactions. The plan should specify what player-specific ARIA assertions ARE in the test suite to compensate.

---

## 6. Risk Register — Gaps

The master plan risk register (§7) has 10 entries. The following risks are NOT covered:

### NEW-R1: BE deploy concurrent with FE deploy mid-traffic
**Scenario:** `streamvault-deploy.sh both` deploys BE first. Between BE restart and FE restart, the live FE sends requests to the new BE. If the new BE has a breaking API change (response shape change on `/api/config/flags`), every TV user in the window hits 500s.  
**Mitigation (not in plan):** For Phase 1, there are no breaking API changes, but the plan should document the ordering policy: always deploy BE first, wait for smoke, then deploy FE. This is implied in `streamvault-deploy.sh` but not explicit.

### NEW-R2: Snapshot during active write load
**Scenario:** `pg_dump --table='sv_*'` runs while a user is actively watching and writing watch-history rows. The dump is consistent at the transaction level (pg_dump uses a repeatable-read snapshot), but if the restore drops and recreates tables mid-session, in-flight writes after stop+before-stop are lost.  
**Mitigation:** The plan already stops both services before pg_restore. The issue is: `pg_dump` is taken BEFORE stopping services (capture of "current live state"). Any writes between dump and stop are not in the snapshot. On rollback, history rows from the last few seconds before a bad deploy are lost. This is acceptable for operational rollback but should be documented as "< 1 minute of watch history may be lost on rollback."

### NEW-R3: Feature-flag table corruption during rollback
**Scenario:** Rollback restores `sv_feature_flags` (or `sv_settings` depending on which spec wins C-2) to old state. If the rollback was triggered because a NEW flag was incorrectly set to `true`, the restored DB will contain the OLD flag state — which may have been `false` (correct). But if the incident was a CODE bug (not a flag bug), and the operator had already manually disabled the flag, the rollback will restore the OLDER flag state that may re-enable it.  
**Status:** Partially addressed in 04-rollback §R4 and 05-product-scope Risk 4. The mitigation (print flag delta, operator manually re-disables) is documented but NOT scripted. For autonomous operation while user is away, this is a real gap — no human operator to re-disable flags.

### NEW-R4: Auto-merge of a subjective UX regression that passes all automated gates
**Scenario:** A PR changes the tap-toggle timing from 300ms to 250ms. All tests pass. Bundle budget passes. Pixel-identical snapshot. But on real devices the behavior feels wrong. This PR auto-merges and deploys.  
**Status:** The plan acknowledges "user returns, validates" but provides no circuit-breaker for subjective regressions during autonomous operation. Acceptable given the user explicitly authorized autonomous merging while away, but should be documented.

### NEW-R5: Third-party dep `@use-gesture/react` CVE during the implementation window
**Scenario:** `@use-gesture/react ^10.x` is added without a pin. A CVE is published. Auto-merge ships it.  
**Mitigation (not in plan):** Pin the exact version (`10.3.1` or current stable) in `package.json`, not `^10.x`. Add `npm audit --audit-level=high` to the lint gate.

### NEW-R6: Secret rotation during rollback
**Scenario:** Operator decides to rotate `JWT_SECRET` as part of incident response. Then runs rollback. The rolled-back BE image is built with the OLD secret. All current sessions are now signed with the NEW secret and will be rejected by the rolled-back image.  
**Mitigation (not in plan):** Document that secret rotation must happen AFTER rollback is confirmed stable, not concurrently.

### NEW-R7: Docker image tag pruned before rollback is needed
**Scenario:** `docker image prune -f` or similar cleanup removes the tagged images (`ai-orchestration-streamvault-v3-frontend:20260429-...`). Rollback script tries to `docker tag` the old image and fails at step 5 with "image not found."  
**Status:** Partially addressed in the rollback script (fail message says "rebuild required") but no preventive measure. Recommend: add `docker image inspect "$FE_IMAGE" >/dev/null 2>&1 || fail "..."` BEFORE the stop-services step, so images are verified while services are still running.

---

## 7. Subagent Permission Model

The memory note `feedback_subagent-permission-layer.md` states: "subagents don't inherit main-session approvals — widen `settings.local.json` allowlist; `dangerouslyDisableSandbox` doesn't fix permissions."

**Assessment of the plan:** The master plan does NOT mention `settings.local.json` widening at any point. During implementation, subagents will need to:
- Run `git` commands (commit, push, branch)
- Run `npm install`, `npm test`, `npm run build`
- Run `docker` commands (via SSH or locally)
- Run `bash` scripts in `bin/`
- Write files in `postgres/`, `bin/`, `src/`, `tests/`, `.github/workflows/`

If these are not in the `settings.local.json` allowlist, each subagent will hit permission prompts that block autonomous execution — defeating the purpose of autonomous operation while the user is away.

**Recommendation:** Add a pre-implementation step to the plan:

```
STEP 0 (before any implementation PR):
- Run `update-config` skill to add the following to settings.local.json allowlist:
  - Bash: git *, npm *, docker *, bash bin/*, npx playwright*
  - Write: src/**, postgres/**, bin/**, .github/workflows/**, tests/**
- Verify with a dry-run subagent that reads a file without prompting
- Do NOT use dangerouslyDisableSandbox=true — use explicit allowlist
```

This step is currently missing from the plan and will cause autonomous implementation to stall on first subagent permission check.

---

## 8. Top 5 BLOCKERS (Must Fix Before Implementation Starts)

### BLOCKER-1: Feature flag key naming and storage location must be canonicalized
**Files to fix:** Master plan §5 PR-BE-1, `02-fe-architecture.md` §7.1, `04-rollback-and-flags.md` §6, `05-product-scope.md` FR-10  
**Action:** Adopt `sv_feature_flags` table (03-be design). Define canonical key list (dot-notation from master plan: `adaptive.player.tap_toggle`, `adaptive.mobile.enabled`, etc.). Update 02-fe §7.1 to use those exact keys. Remove JSON-blob-in-sv_settings references from 04-rollback and 05-product-scope.

### BLOCKER-2: PR sequence must be reordered to enable the rollback drill
**Files to fix:** Master plan §5 and §10  
**Action:** PR sequence must be: PR-BE-1 (merge+deploy) → PR-OPS-1 (merge+deploy) → PR-OPS-2 (merge+deploy) → run drill → PR-FE-1 (merge+deploy) → PR-FE-2 (merge+deploy). The drill cannot run until BE config endpoint exists and rollback scripts are deployed. Current sequence has OPS-1 before BE-1 in merge order, which means the drill would fail on the smoke endpoint check.

### BLOCKER-3: Preview stack silently writes to live DB until `SV_SCHEMA_PREFIX` is implemented
**Files to fix:** `04-rollback-and-flags.md` §5, Master plan §5 PR-OPS-2  
**Action:** Before PR-OPS-2 merges, either: (a) add a one-line BE change that respects `SCHEMA_PREFIX` env var as a table prefix override, OR (b) create a separate `streamvault_preview` DB as noted in 04-rollback as the fallback, OR (c) mark the preview stack as "read-only shared DB, operator must not run live Xtream credentials." One of these three must be explicitly chosen and implemented. The current spec acknowledges the gap but doesn't resolve it.

### BLOCKER-4: `settings.local.json` allowlist must be widened before any subagent spawning
**Files to fix:** Master plan §10, or a pre-flight settings update  
**Action:** Add Step 0 to the plan sequence: run `update-config` skill to widen subagent permissions in `settings.local.json` for git, npm, docker, bash, and file-write access to all implementation paths. Without this, the first subagent will halt on a permission prompt.

### BLOCKER-5: norigin initialization strategy must be resolved (C-6)
**Files to fix:** `01-ux-spec.md` §OD6, `02-fe-architecture.md` §4.1  
**Action:** The two specs contradict each other on whether norigin is disabled for non-TV. The 02-fe rationale (no teardown API) is correct — norigin cannot be un-initialized. Adopt 02-fe's strategy. Remove the conditional-init code from 01-ux §OD6 OR clearly mark it as "FYI only, not to be implemented." If the 01-ux code is copied to `main.tsx`, it will break desktop/mobile by initializing norigin with `shouldFocusDOMNode: false` which leaves focus management broken on all non-TV surfaces.

---

## 9. Top 10 SUGGESTIONS (Non-Blocking)

### S-1: Add v2 archive task as a tracked Phase 1 checklist item
**Why:** Requirement 2 scores 2/5. Currently deferred with no concrete action. Add a checklist item to the Phase 1 DoD: "Grep for v2 references; if none, file archive issue in GitHub." This doesn't block implementation but ensures it doesn't get forgotten.

### S-2: Canonicalize InputMode type to 02-fe's 3-mode + `isTV` boolean approach
**Why:** Conflict C-7. The 01-ux `"dpad"` mode conflates input device with platform. The 02-fe `isTV` boolean is cleaner. Updating master plan §3 A2 to reflect this avoids the implementer having to make a design call mid-PR.

### S-3: Pin `@use-gesture/react` to exact version and add `npm audit` to CI gate
**Why:** Risk NEW-R5. `^10.x` allows minor version upgrades that could introduce behavior changes or CVEs during autonomous operation. Pin to `10.3.1` (or current stable, verify before implementation).

### S-4: Add `docker image inspect` check BEFORE stop-services in rollback script
**Why:** Risk NEW-R7. Currently the script stops services, then discovers the image is missing at step 5 — leaving both services down. Moving the image verification to step 1 (before any destructive action) eliminates this outage window.

### S-5: Hard-code TV bundle ceiling at 240 KB gz everywhere (resolve the 213/240/243 conflict)
**Why:** Three specs have different numbers. CI must be written against one. 240 KB is the right number (current ~213 + 30 KB budget as designed). Update master plan §8 DoD to say "≤ 240 KB gz" and update PR-FE-1 bundle budget statement.

### S-6: Add `npm audit --audit-level=high` to the per-PR gate (step 1 or step 2)
**Why:** No security scan for third-party deps is in the gate sequence. This catches known CVEs before merge. Zero runtime cost addition to the lint job.

### S-7: Add explicit deploy ordering policy for concurrent FE+BE changes
**Why:** Risk NEW-R1. The deploy script handles `both` but doesn't document the API compatibility window. Add a one-paragraph note to master plan §2 principles: "When both repos change in the same phase, always deploy BE first and wait for smoke before deploying FE."

### S-8: Document the "lost watch history window" limitation of rollback
**Why:** Risk NEW-R2. Operators need to know what is NOT recovered. Add one sentence to the rollback script header: "Watch history rows written in the ~10s window between snapshot capture and service stop will not be restored."

### S-9: Resolve the deploy ID format conflict (C-8) and verify rollback SHA extraction
**Why:** The SHA extraction regex in `bin/rollback.sh` (`grep -oP '[a-f0-9]{7}$'`) will fail against the master plan format (`deploy-YYYYMMDD-sha1-sha2`) since the last 7 chars would be part of `sha2`, not an isolated match. Either use the 04-rollback format (one SHA in ID) or update the regex. Since the plan links FE and BE SHAs together in the ID, the two-SHA format is better — but the regex must be updated.

### S-10: Add an "autonomous operation hard-stop" condition to §2 principles
**Why:** Requirements 11 (token exhaustion / paid services) scores 2/5. Add to §2:
> "Hard stop triggers: (a) any step requires a paid external service not previously authorized; (b) token budget warning from the model runtime (treat as STOP, file status report, wait for user); (c) any destructive operation on the shared Postgres not covered by the sv_* scope filter."

---

## 10. Overall Verdict

**GO-WITH-FIXES**

The master plan is substantively solid. The mission is correct, the architecture decisions are sound, and the risk register is thoughtful for most categories. The expert specs are detailed and mostly self-consistent. The plan is NOT a NO-GO.

However, **BLOCKER-1** (flag key/storage mismatch) and **BLOCKER-5** (norigin contradiction) are genuine implementation hazards — an implementer following any one spec in isolation will produce broken code. **BLOCKER-4** (subagent permissions) will halt autonomous execution before the first PR is written. **BLOCKER-2** (PR sequence) will cause the rollback drill to fail. **BLOCKER-3** (preview DB isolation) is a data-safety issue.

These five items require edits to the plan documents before implementation begins. None require architectural changes — they are clarifications and sequencing fixes.

The plan is authorized to proceed to `grill-me` after these fixes are applied. Once grill-me passes, implementation may begin.

---

## Appendix: Files That Need Edits

| File | Issue | Required change |
|---|---|---|
| `streamvault-v3-adaptive-responsive.md` §5 PR-OPS-1 | PR sequence | Reorder: BE-1 → OPS-1 → OPS-2 → drill → FE-1 → FE-2 |
| `streamvault-v3-adaptive-responsive.md` §8 DoD | Bundle budget | Change "TV initial ≤ 213 KB gz" to "≤ 240 KB gz" |
| `streamvault-v3-adaptive-responsive.md` §10 | SDLC sequence | Add Step 0: widen settings.local.json; add explicit drill-dependency note |
| `streamvault-v3-adaptive-responsive.md` §2 principles | Gaps | Add: hard-stop conditions; BE-first deploy ordering; lost-history window |
| `02-fe-architecture.md` §7.1 | Flag key names | Replace all flag key names with canonical dot-notation from master plan |
| `04-rollback-and-flags.md` §6 | Flag storage | Remove sv_settings JSON blob approach; reference sv_feature_flags table |
| `04-rollback-and-flags.md` §5 | Preview DB | Resolve `SV_SCHEMA_PREFIX` gap — choose one of the three options |
| `05-product-scope.md` FR-10 | Flag storage | Remove sv_settings reference; use sv_feature_flags table |
| `01-ux-spec.md` §OD6 | norigin init | Mark code snippet as "illustrative only — see 02-fe-architecture §4.1 for implementation" |
| All specs | Deploy ID format | Standardize on one format; update rollback SHA-extraction regex |

**Report written to:** `/home/crawler/streamvault-v3-frontend/.claude/plans/v3-adaptive/eval-report.md`
