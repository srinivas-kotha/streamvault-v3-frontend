# Code Review — PR-BE-1: `sv_feature_flags` table + `/api/config/flags` endpoints

**Reviewer:** Code-reviewer agent (Claude Sonnet 4.6)
**Date:** 2026-04-29
**Branch:** `v3-adaptive/feature-flags` → `main` (streamvault-backend)
**PR:** https://github.com/srinivas-kotha/streamvault-backend/pull/58

---

## Verdict: REQUEST_CHANGES

Two issues block merge. Both are fixable in < 30 minutes.

---

## Mandatory Check Results

| Check | Result |
|---|---|
| No TV regression | PASS — BE-only PR. No frontend files touched. TV is unaffected. |
| Flags inert without seeds | PASS — Seeds only insert on `ON CONFLICT DO NOTHING`. GET returns empty `{}` flags map if table is empty. Inert by default. |
| Gates wired (tests) | PARTIAL FAIL — 12 tests exist and cover both endpoints + auth paths + error paths. Missing: `feature-flags.service.ts` has no direct unit tests. Overall coverage ~75%, below the 80% gate required in master plan §5. |
| A4 (canonical naming) | PASS — All seed keys are `adaptive.gestures.enabled`, `adaptive.mobile.enabled`, `adaptive.desktop.enabled`, `adaptive.player.tap_toggle`. Dotted lowercase. No camelCase. Regex validates correctly. |
| A13 (no-store) | PARTIAL PASS — `no-store` is set on successful GET and POST responses. NOT set on 500 error responses. See finding F3. |
| No 401 on unauth GET | PASS — `softAuthMiddleware` never calls `res.status(401)`. Missing/invalid token falls through to globals. Test asserts this. |
| CSRF on POST | PASS — `csrfMiddleware` is mounted globally at `app.use(csrfMiddleware)` (line 80 of index.ts), before all routers. POST `/api/config/flags/:key` is a mutating request; it is covered by the global middleware. No per-router exemption added. The unit tests skip CSRF because they mount a raw Express app without the middleware — this is standard practice. |
| Admin-only POST | PASS — `req.user.userId !== 1` → 403. Tested for unauthed + non-admin cases. |
| Mount before events catchall | PASS — `app.use("/api/config", configRouter)` is at line 111; `app.use("/api", eventsRouter)` is at line 117. Correct order confirmed. |
| SQL parameterized | PASS — All queries use `$1`/`$2`/... placeholders. No string concatenation anywhere. |
| Migration reversible | PASS — `05-feature-flags.down.sql` drops indexes then table. Cleanly inverts the up migration. |
| No secrets in code | PASS — No hardcoded credentials. All DB access via injected `query()` from `db.service`. |

---

## Findings

### F1 — CRITICAL: COALESCE expression in table-level UNIQUE constraint is invalid Postgres SQL

**File:** `postgres/05-feature-flags.sql` lines 29–31
**Also:** `src/services/feature-flags.service.ts` line 67

```sql
-- FAILS IN POSTGRES:
CONSTRAINT sv_feature_flags_unique_key_scope
  UNIQUE (key, scope, COALESCE(scope_id, ''))
```

PostgreSQL's table-level `UNIQUE` constraint syntax only accepts bare column identifiers — not expressions. This is a grammar restriction (`columnList → ColId`), not a version issue. The migration will throw:

```
ERROR: syntax error at or near "("
```

Because `COALESCE(scope_id, '')` is an expression, not a column name.

Additionally, the upsert in `feature-flags.service.ts` uses `ON CONFLICT ON CONSTRAINT sv_feature_flags_unique_key_scope` which references this named constraint. Since the constraint cannot be created, the upsert also fails.

**Fix — two-part:**

1. In `postgres/05-feature-flags.sql`, remove the inline `CONSTRAINT ... UNIQUE(...)` clause from the `CREATE TABLE` block and add this after it:

```sql
CREATE UNIQUE INDEX sv_feature_flags_unique_key_scope
  ON sv_feature_flags (key, scope, COALESCE(scope_id, ''));
```

2. In `src/services/feature-flags.service.ts` lines 66–68, change:

```sql
-- Before:
ON CONFLICT ON CONSTRAINT sv_feature_flags_unique_key_scope
-- After:
ON CONFLICT (key, scope, COALESCE(scope_id, ''))
```

Note: `ON CONFLICT ON CONSTRAINT` only works with named table constraints, not expression indexes. The expression form must be used instead.

The seed `INSERT ... ON CONFLICT ON CONSTRAINT sv_feature_flags_unique_key_scope DO NOTHING` in the SQL file must also be updated to:

```sql
ON CONFLICT (key, scope, COALESCE(scope_id, '')) DO NOTHING
```

---

### F2 — HIGH: Response contract missing `ttl_seconds` — breaks FE localStorage cache

**File:** `src/routers/config.router.ts` lines 41–45

The master plan §5 PR-BE-1 specifies the response shape as:
```json
{ "flags": { "key": value }, "etag": "...", "fetched_at": "..." }
```

The FE client spec (`02-fe-architecture.md` §featureFlags.ts) reads `data.ttl_seconds` from this response to set the localStorage TTL:

```ts
localStorage.setItem(LS_TTL_KEY, String(Date.now() + data.ttl_seconds * 1000));
```

The current BE implementation returns `{ flags, scope, fetchedAt }` — no `ttl_seconds`. When PR-FE-1 merges, `data.ttl_seconds` will be `undefined`, causing:

```
Date.now() + undefined * 1000 → NaN
localStorage.setItem('sv_feature_flags_ttl', 'NaN')
Number('NaN') = NaN
Date.now() < NaN → always false
```

The localStorage cache will never hit. Every component render that calls `useFeatureFlag()` will re-fetch `/api/config/flags` from the network. This defeats R3's mitigation (3-second timeout guard) and hammers the BE on every page load. Also violates A13's 5-second TTL contract.

**Fix:** Add `ttl_seconds: 5` (or whatever the canonical value is) to the GET response. Also add `etag` if conditional requests are planned (can be a hash of the flags map or a DB `updated_at` max). Minimum fix:

```ts
res.json({
  flags,
  scope: userId ? "user" : "global",
  fetched_at: new Date().toISOString(),   // snake_case per spec
  ttl_seconds: 5,                          // per A13 / FE client spec
});
```

---

### F3 — MEDIUM: `Cache-Control: no-store` missing from 500 error responses on GET

**File:** `src/routers/config.router.ts` lines 46–55

The `no-store` header is set only on the success path (before `res.json()` at line 40). On the error path (line 51), neither the GET nor POST handler sets `Cache-Control`. A proxy or CDN could cache a `500` response, causing stale error pages to be served even after the DB recovers.

For the kill-switch endpoint specifically, cached 500s are dangerous: the app would see repeated 500 responses from cache and fall back to all-flags-false mode, which is safe — but the error would look persistent to operators.

**Fix:** Set `res.set("Cache-Control", "no-store")` before every `res.status(5xx)` call, or apply it once as a router-level middleware:

```ts
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
```

---

### F4 — LOW: `feature-flags.service.ts` has no direct unit tests

**File:** `src/services/feature-flags.service.ts` (73 lines, 0 test file)

The service's logic is exercised only via router tests that mock `db.service`. This means the actual SQL strings in `getGlobalFlags`, `getUserFlags`, and `upsertFlag` are never validated by any test — only the router wiring is. Edge cases like `getUserFlags(0)`, `getUserFlags(-1)`, and `getMergedFlags(undefined)` are untested at the service level.

Combined with the router test coverage (~85%), overall new-code coverage is ~75%, below the 80% gate in master plan §5.

**Fix:** Add `src/services/feature-flags.service.test.ts` with at least: `isValidFlagKey` edge cases (including the regex edge cases tested below), `getUserFlags` guard on non-positive userId, and `getMergedFlags` merge ordering.

---

### F5 — NIT: `scope` field in GET response is undocumented / naming inconsistency

**File:** `src/routers/config.router.ts` line 43

The response includes `scope: userId ? "user" : "global"`. This field is not in the master plan spec (which lists `flags`, `etag`, `fetched_at`). It's not harmful but it's extra undocumented surface on the contract. If the FE ever uses it, it needs to be documented.

Also: `fetchedAt` uses camelCase but the spec says `fetched_at` (snake_case). This will become a contract mismatch when the FE reads it.

---

### F6 — NIT: `src/db/featureFlags.ts` specified in master plan, not delivered

**Master plan §5:** Lists `src/db/featureFlags.ts (new repository)` as a required file.

**Actual:** Logic consolidated into `src/services/feature-flags.service.ts`. This is a reasonable architectural simplification (fewer files, same behavior). However it diverges from the spec. Note for the orchestrator: update the master plan if this consolidation is intentional.

---

## Stretch Check Results

| Check | Result |
|---|---|
| Regex rejects `adaptive.` (trailing dot) | PASS — regex requires `(\.[a-z0-9_]+)+` meaning each segment after `.` must have at least one char |
| Regex rejects `.foo` (leading dot) | PASS — regex requires `^[a-z]` first char |
| Regex rejects `adaptive..foo` (empty segment) | PASS — `\.` requires non-empty match after it |
| Regex rejects `_bad.key` (leading underscore) | PASS — `^[a-z]` enforced |
| Upsert `EXCLUDED.updated_by` | PASS — correctly uses `EXCLUDED.updated_by` so the new caller's identity is captured on re-update |
| Pre-migration GET failure | PARTIAL — if table doesn't exist yet, `getGlobalFlags()` will throw and the handler returns 500. Acceptable per the handler's catch block. No silent corruption. |
| No-store on 5xx | FAIL — see F3 |

---

## Test Coverage Estimate

| File | Lines | Tests | Coverage est. |
|---|---|---|---|
| `src/routers/config.router.ts` | 115 | 12 router tests | ~85% |
| `src/services/feature-flags.service.ts` | 73 | 0 direct (exercised via router mocks) | ~60% |
| `postgres/05-feature-flags.sql` | 48 | Not unit-testable (SQL) | N/A |
| **New code combined** | **188** | **12** | **~75%** |

**Gate requirement:** ≥ 80% (master plan §5 PR-BE-1). **Not met.** Delta is small — adding a `feature-flags.service.test.ts` with ~10 direct unit tests would push this over 80%.

---

## Summary of Required Changes Before Merge

1. **F1 (CRITICAL):** Fix `COALESCE` in `UNIQUE` constraint — move to `CREATE UNIQUE INDEX`, update `ON CONFLICT` syntax in both the migration SQL and the service upsert query. This is a deploy-day blocker: the migration will fail and the table won't be created.

2. **F2 (HIGH):** Add `ttl_seconds: 5` (and `fetched_at` per spec naming) to the GET response. Without it, FE-1's localStorage cache is broken before it's written.

Fixing F3 (MEDIUM) and adding F4's service tests to hit 80% coverage are strongly recommended but blocking-in-spirit: the master plan sets 80% as a hard gate, not a suggestion.
