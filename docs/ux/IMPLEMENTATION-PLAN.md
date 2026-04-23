# Implementation Plan — StreamVault v3 UX Rebuild

**Date:** 2026-04-22 (approved Gate 2b, start Gate 3 next session)
**Status:** Plan approved, Phase 0 pending
**Between-phase protocol:** manual `workflow_dispatch` Deploy after every phase. Stop and wait for user thumbs-up before starting the next phase. No chaining.
**PR #71:** parked. Manual deploys only for the duration of the rebuild.
**CI/CD work:** on hold. No flake-hunting, no structural redesign (option C).

---

## Source-of-truth docs (all in `docs/ux/`)

- `00-ia-navigation.md` — spine, language-first, 60-day session, typography + glass systems
- `01-live.md` — Live TV, Sports chip, SplitGuide, EPG filter
- `02-series.md` — Series list + detail
- `03-movies.md` — Movies rebuild (language-first, no CategoryStrip, VirtuosoGrid)
- `04-search-and-language-rail.md` — Search across Live/Movies/Series + shared LanguageRail
- `05-player.md` — player controls, auto-hide, popovers, Live/VOD diffs
- `99-grill-findings.md` — revision status + open backend asks

---

## Phase summary

| # | Phase | Est | Frontend | Backend | Closes |
|---|---|---|---|---|---|
| 0 | Housekeeping | 5 min | issue comments | — | #51 |
| 1 | Foundation (auth + primitives) | 2-3 hr | tokens, shared components, 60-day session | refresh TTL 90d→60d | 60-day user ask, cross-cutting tokens |
| 2 | Movies rebuild | 3-4 hr | delete CategoryStrip, VirtuosoGrid, bottom sheet | — | 03-movies.md, screenshot bug |
| 3 | Live rebuild | 2 hr | SplitGuide, lazy EPG | — | 01-live.md |
| 4 | Series rebuild | 2-3 hr | list + detail per spec | — | 02-series.md |
| 4.5 | Series history migration | 1 hr | switch to direct query | `sv_watch_history.series_id` col + backfill | #53 |
| 5 | Search rebuild | 2 hr | rail post-query, kind chips | — | 04-search.md |
| 5.5 | Search prefix tweak | 30 min | — | `:*` per token in FTS query | Search prefix ask |
| 6 | Player upgrade | 3-4 hr | full control bar, popovers, auto-hide | — | 05-player.md, player controls ask |
| 7 | Settings + polish | 1-2 hr | favorites/history links, reduced-motion sweep | — | cross-cutting cleanup |

**Total:** ~17-22 hr frontend · ~1.5 hr backend.

---

## Phase 0 — Housekeeping

- Close #51 with comment pointing to revised `03-movies.md`.
- Comment on #69: "revisit after Phase 1 auth rebuild — login flow is changing, flake may self-fix."
- Leave #63 (prod E2E) parked.
- Leave PR #71 parked. Env-var fix is correct; deeper issue is backend EPG hang in CI (separate track).

---

## Phase 1 — Foundation: auth + shared primitives

**Frontend:**
- `src/design/tokens.ts` + CSS vars — typography (7-token scale, Inter Display) + glass/surface treatment + focus ring.
- Shared components:
  - `LanguageRail` — controlled, surface-aware (4 or 5 chips)
  - `ContinueWatchingChip` — leftmost in LanguageRail, conditional
  - `TierLockBadge`
  - `EmptyStateWithLanguageSwitch`
- Hooks:
  - `useLangPref()` wrapping `sv_lang_pref` localStorage
- Client helpers:
  - `inferLanguage(categoryName)` — mirrors backend's pattern set, used for search result annotation
- 60-day session:
  - `sv_access_token` sessionStorage → localStorage
  - Silent `/auth/refresh` on app boot before auth gate decides
  - Update logout to clear both tokens
  - Update `tests/e2e/helpers.ts` fixture

**Backend (`streamvault-backend`):**
- `src/config.ts:28`: `refreshExpiresIn: '90d'` → `'60d'`
- `src/routers/auth.router.ts:29`: `REFRESH_MAX_AGE` constant → 60 days

**Manual deploy.** User validation: close browser, reopen next day, still logged in. Logout works. Language preference round-trips.

---

## Phase 2 — Movies rebuild

**Frontend only.**

1. Delete `CategoryStrip` component + all imports.
2. Mount `LanguageRail` (4 chips: Telugu/Hindi/English/All).
3. Build `src/features/movies/languageUnion.ts`:
   - Fetch `/api/vod/categories` once (cached 5 min)
   - Filter categories where `inferredLang === lang`
   - Parallel-fetch `/api/vod/streams/:catId` for matches (bounded concurrency = 8)
   - Dedupe by id, sort by current sort key
   - Memoize per `(lang, sortKey)`
4. Swap poster grid → `VirtuosoGrid` (react-virtuoso). Focus-key persistence across windowed remount.
5. Card states (`MovieCard`): idle / focused / in-progress / watched / tier-locked (best-effort via `sv_tierlock_cache` session storage).
6. Visible `⋯` overflow on focused card → menu: Add to favorites / Mark watched / More info.
7. `MovieDetailSheet` — bottom sheet (not route), Back closes.
8. Toolbar: segmented sort (Added/Name) + count.
9. Empty state → language-switch buttons (`"Try Hindi"` / `"Try English"` / `"Show All"`).
10. Delete dead code: old `CategoryStrip`, any Movies-specific language storage keys.

**Manual deploy.** User validation: `/movies` with Telugu → real Telugu movies, no category junk. Grid stays fluid on "All". `⋯` menu works. Bottom sheet Back works.

---

## Phase 3 — Live rebuild

**Frontend only.**

1. `LiveRoute` adopts shared `LanguageRail` (5 chips incl. Sports).
2. `SplitGuide` component: left channel list (1-D vertical), right EPG panel.
3. Lazy EPG on focus change: `/api/live/epg/:channelEpgId?from=now&to=+3h`, per-channel cache 5 min.
4. Toolbar: Sort segmented (Number/Name/Category) + EPG time filter (All/Now/2h).
5. Row `⋯` overflow (favorites).
6. Continue-watching chip wiring.

**Manual deploy.** User validation: `/live` language switching. EPG right panel updates on channel focus change. Sports chip surfaces real sports channels.

---

## Phase 4 — Series rebuild

**Frontend only.**

1. `/series` list: 4 chips, drop genre facet, align with Movies visual pattern.
2. `/series/:id` detail:
   - Backdrop image from `CatalogItemDetail.backdropUrl`
   - Hero CTA auto-focus with complete logic:
     - if history: `progress/duration > 0.9` → next episode; else → Continue S_E_ mm:ss/mm:ss
     - all-watched → Rewatch S1E1
     - first-visit → Play S1E1 (first playable)
   - Tier-lock precheck banner: non-dismissable if ANY episode `!canPlay`
   - Season chip rail (horizontal, D-pad Left/Right)
   - Episode rows with still-image, title, synopsis, duration, state glyph
   - Row `⋯` overflow (Mark watched / Remove from history)
3. Client-side series resume derivation (brittle path, replaced in 4.5).
4. Card activation matrix enforced: Enter on series card → `navigate('/series/:id')`, never `openPlayer`.

**Manual deploy.** User validation: series flows. Resume-first hero. Back returns focus to originating card.

---

## Phase 4.5 — Backend migration for #53

**Backend (`streamvault-backend`):**

1. Migration: `ALTER TABLE sv_watch_history ADD COLUMN series_id INTEGER` (nullable).
2. Index: `CREATE INDEX idx_sv_history_series ON sv_watch_history(user_id, series_id) WHERE content_type = 'series'`.
3. Backfill script: parse `content_name` prefix ("SeriesName · S2E5 · ...") to derive `series_id`. Run once.
4. `recordHistory()` update: when `content_type === 'series'`, write `series_id` alongside `content_id`.
5. New query: `SELECT series_id, MAX(watched_at) ... GROUP BY series_id`.

**Frontend:** switch `historyForSeries(seriesId)` from derivation to direct query.

**Manual deploy (backend).** User validation: resume-by-series still works; spot-check a mid-watch series.

---

## Phase 5 — Search rebuild

**Frontend only.**

1. `SearchRoute`:
   - Input auto-focused on mount.
   - Debounce 250ms; Enter bypasses.
   - Rail + Kind chips render only after `hasResults`.
2. `LanguageRail` post-query (4 chips). Client-side annotation via `inferLanguage(category_name)` on each hit.
3. Kind chips (All/Live/Movies/Series) — purely presentational section filter.
4. Sections ordered Movies → Series → Live.
5. Card activation matrix: Live/VOD → `openPlayer`; Series → `navigate('/series/:id')`.
6. Focus stays in input after first results; ArrowDown moves to first card.

**Manual deploy.** User validation: `"vikram"`, `"telugu action"`, `"cricket"` (name match on Live), `"zxcvq"` (empty state).

---

## Phase 5.5 — Backend search prefix tweak

**Backend:**

- Modify `catalog.service.ts` search: convert user query tokens → `to_tsquery('english', tokens.map(t => t + ':*').join(' & '))`.
- Keep `ts_rank` ordering.
- Sanitize tokens (strip `&`, `|`, `!`, `:`, `(`, `)` before concatenation).

**Manual deploy (backend).** User validation: `"vikr"` now finds `"vikram"`.

---

## Phase 6 — Player upgrade

**Frontend only — the big user ask.**

1. `PlayerProvider` gains three glass bands (per `05-player.md §2`):
   - Top bar: Back + title + current timestamp
   - Scrubber (VOD/Series) or `● LIVE` badge (Live)
   - Control bar: ⏮ ⏯ ⏭ · ◀◀ · ▶▶ · 🔉 · Audio ▾ · Subs ▾ · Quality ▾
2. Control disabled states use `focusable: false` (skip, don't dim).
3. D-pad focus flow per `05-player.md §4`:
   - On open: focus = center Play/Pause button
   - Left/Right walks control bar (no wrap)
   - Up from control bar → Back in top bar
   - Down from Back → Play/Pause (predictable return)
4. Auto-hide: 3s idle, fade 300ms. Wake on any D-pad. **Enter short-circuits pause/play even when controls hidden.** (This is the only control that bypasses wake.)
5. Hold ±10s button → 30s variable seek every 500ms.
6. Popovers (audio/subs/quality): glass, auto-focus current, Up/Down walks, Enter commits, Back cancels, Left/Right closes + advances to next control.
7. Volume: vertical slider popover, 5% steps, 2s idle auto-close.
8. Playback-failure overlay: amber, specific copy for tier-lock (`.mp4` vs `.ts` plan limit) vs generic error. No red. No auto-retry.
9. Live vs VOD differences per `05-player.md §8`.
10. Reduced-motion support.

**Manual deploy.** User validation: every control ≤3 D-pad presses. Pause works in 1 press. Audio track switching on a dual-audio movie. Quality dropdown. Scrubber seek. Tier-lock overlay copy on a known .mp4 title.

---

## Phase 7 — Settings + cross-cutting polish

**Frontend only.**

1. Settings: visible links to `/favorites` and `/history` (IA §1 promises these).
2. `prefers-reduced-motion` sweep: verify every animated surface respects it.
3. Typography + glass tokens drift audit: ensure no hardcoded hex colors, no off-scale font sizes. Grep for `#` in `.tsx` and `.css`.
4. Remove any dead code uncovered during rebuild.
5. Consistent focus-ring token everywhere (`--focus-ring`).

**Manual deploy.** User final validation sweep across all screens.

---

## Post-MVP / parked

- **#63 — Resurrect prod E2E regression suite.** CI/CD, revisit after rebuild.
- **#69 — webkit auth/visual-polish flakes.** Revisit post-Phase 1 (auth rewrite may change the root cause).
- **PR #71 — env-var fix.** Currently open; merge after CI is unfrozen.
- **Backend P2 asks** (grill findings):
  - `/api/vod/search` with year/genre/rating filters + facet counts — unblocks Movies filter drawer
  - `/api/trending?lang=X` — unblocks Search trending rail
  - `/api/search/recent` — unblocks server-backed recent searches
  - `pg_trgm` + did-you-mean
  - Similar-items endpoint
- **Phase 2 languages** (Tamil / Malayalam / Kannada / Punjabi chips).

---

## Key decisions locked-in (reference)

From `00-ia-navigation.md §8` decision log:

1. 5-tab dock kept.
2. Favorites/History are routes not tabs.
3. Language primary browse axis.
4. 5 chips Live, 4 chips Movies/Series/Search (fixed order).
5. Telugu install default.
6. Hybrid persistence (localStorage prefs, URL transient).
7. Chip rows only (no native select).
8. No dock wrap.
9. Year/Genre/Rating facets deferred.
10. Access token → localStorage, refresh TTL 60d sliding.
11. **Sports is Live-only.**
12. Continue-watching = chip, not row.
13. Typography: single scale, no overrides.
14. Glass on overlays only.
15. Player in its own spec.
16. Search covers all 3 types.

---

## Start-of-next-session command

```
Read docs/ux/IMPLEMENTATION-PLAN.md and
~/.claude/projects/-home-crawler/memory/streamvault-v3-ux-rebuild-handoff.md,
then ask me if I want to start Phase 0.
```
