# UX Spec Grill — findings

**Reviewer:** adversarial UX + eng critic  ·  **Date:** 2026-04-22
**Specs reviewed:** `00-ia-navigation.md`, `02-series.md`, `03-movies.md`, `04-search-and-language-rail.md`
**Ground truth:** frontend `src/routes/*.tsx`, `src/App.tsx`, `src/nav/BottomDock.tsx`, `src/player/*`, `src/api/schemas.ts`, backend routers + `src/providers/xtream/xtream.provider.ts`, `postgres/03-phase3-services.sql`, handoff `2026-04-22`.

## Severity legend
- BLOCKER — ships as a bug / data inconsistency / impossible to build
- MAJOR — significant UX regression, rework likely, or cross-spec contradiction
- MINOR — polish / nit / clarification

---

## 1. Inter-spec conflicts

### 1.1 BLOCKER — localStorage key war: `sv_lang_pref` vs `sv_series_lang`/`sv_movies_lang`
- IA (`00-ia-navigation.md:204`) and Search spec (`04-search-and-language-rail.md:44-53`) declare ONE global key `sv_lang_pref`.
- Series spec (`02-series.md:14` TL;DR, `02-series.md:70`, `02-series.md:444` persistence table) writes `sv_series_lang`.
- Movies spec (`03-movies.md:73-74`, `03-movies.md:304` "sv_movies_lang — last-used lang set") writes `sv_movies_lang`.
- The handoff P0 #2 originally proposed `sv_live_lang` — Search spec absorbed it, the other two did not.
- Movies/Series specs have **zero read-path** for `sv_lang_pref`; a user who sets Telugu once globally via Search/Live will still see `all` (default) on Movies until they pin it a second time.
- **Fix:** pick one. Recommend Search spec's `sv_lang_pref` + the `sv_lang_pref_fallback` shim for Sports-excluded surfaces. Rewrite 02-series §7 table and 03-movies §4b. Delete `sv_movies_lang` / `sv_series_lang` from both specs.

### 1.2 BLOCKER — Card-click semantics are inconsistent across surfaces
- IA §2.2 rule 1 (`00-ia-navigation.md:112`): "On route mount, focus lands on the **content grid's first item**."
- Movies §2a (`03-movies.md:196-205`): click/OK = **play immediately** (keeps PR #45).
- Series §1 D-pad flow (`02-series.md:108`): Enter on poster = **navigate** to `/series/:id`.
- Search §B.3 (`04-search-and-language-rail.md:267-269`): Live = play, VOD = play, Series = navigate.
- Net result: on the Movies grid Enter plays, on the Series grid Enter navigates, on Search Enter does one of three things depending on section. The user's muscle memory will not converge. That is OK IF each surface commits, but the **Series spec still invites the "fire TV user expects Enter on poster = play" mental model** by auto-focusing `Play S1E1` inside detail (one extra Enter). The real issue: no spec writes the contract down in the IA.
- **Fix:** add one row to IA §2.2 "Poster activation semantics per surface" mapping tab → `play` | `navigate`, and a paragraph acknowledging the first-press penalty on Series. Movies and Series specs must reference that row, not restate it.

### 1.3 MAJOR — Back-stack depth for Series contradicts IA's budget
- IA §2.3 defines depth 3 as "Player overlay open" and claims `Detail open → router.back() to /series grid` (depth 2 → 1). Exit from Player is claimed "depth 3 → 1 or 2".
- Series spec adds `/series/:id` (a real route, history entry). A user who: dock → Series → card (depth 2) → Continue CTA → Player (depth 3) → Back exits Player (depth 2 = detail page) → Back again (depth 1 = list). IA claims Player→1 "when closing" but that's only true for Movies (no detail). The IA's diagram is ambiguous — it says "depth 3 → 1 or 2" in one place, and then "Player → depth 1 (not depth 2) when closing" in the next paragraph (`00-ia-navigation.md:141-146`) — those contradict.
- Also: `PlayerProvider.tsx:85-96` pushes a sentinel history entry and closes on *any* popstate. So from Series detail → Player → Back, popstate closes the Player, but the sentinel entry itself consumes a history slot. Next Back on detail route → browser-back to list. That's an extra popstate event per player close that the IA's "3 Back presses from deepest point" (`00-ia-navigation.md:140-142`) does not account for.
- **Fix:** IA needs an explicit table: `cold dock → Series list → detail → Player → dock` = exactly N back presses, with `N` computed. Also IA must specify whether the Player sentinel counts as a depth increment (it does, behaviorally).

### 1.4 MAJOR — Movies bottom sheet breaks Escape contract
- Movies §3 (`03-movies.md:240-270`) introduces a bottom sheet "not a route". Escape contract (`03-movies.md:270` "sheet open → Esc closes sheet; second Esc goes to dock") **conflicts** with IA §2.3 which only enumerates Player/Detail as stack levels. Bottom sheet is an overlay of unknown depth.
- `App.tsx:105-122` globally binds Escape/Backspace to `setFocus("DOCK_<active>")`. With the sheet open, the first Escape bypasses the sheet and jumps straight to the dock. The sheet loses focus, the dock steals it, and the sheet is left rendered behind the dock ("zombie sheet").
- **Fix:** IA §2.3 needs a "sheet" sub-layer between depth 1 (content) and depth 3 (player). Add to the enumeration. Movies spec must specify an event.stopPropagation on its own Escape handler (or coordinate a capture-phase order with App.tsx).

### 1.5 MAJOR — Search's "rail does not steal focus" vs IA §2.2 "focus lands on grid"
- Search §A.3 (`04-search-and-language-rail.md:57-60`): "Does not steal focus" + rail renders only after `lastSearchedQuery.length >= 2`.
- IA §2.2 rule 1: "On route mount, focus lands on the content grid's first item."
- But SearchRoute.tsx:148 already does `setFocus("SEARCH_INPUT")` on mount — that's neither the grid nor a rail; it's the input. The IA's "first item in grid" rule has no meaning on Search because there is no grid until ≥2 chars are typed. The IA spec never carves out Search as an exception.
- **Fix:** IA §2.2 rule 1 needs "(except Search, where focus lands on the input)".

### 1.6 MINOR — Continue-watching chip promised, no spec owns it
- IA §5.1 (`00-ia-navigation.md:328-336`) invents a "Continue watching" chip in every route's LanguageRail, "leftmost, appears only if history is non-empty." Explicitly says "spec 02/03 to style."
- Series §1 doesn't style it. Movies §1 doesn't style it. Search §B.6 ships its own "Continue Watching" row under a different name and shape (6 posters, not a chip in the rail).
- **Fix:** either cut the IA-mandated chip or add it to Movies/Series as an explicit callout. Current state: silently skipped.

---

## 2. Click-budget audit

### 2.1 Series spec — `/series/:id` "3 inputs" is flaky (`02-series.md:213`)
Claimed: "typical S_E_ pick near the top of a season is **3** (Down to season tab, Down to episode list, Enter)." Recount assuming seeded-focus on Play CTA (`02-series.md:130`, `02-series.md:194` "On-arrival focus: Hero primary CTA"):
- ArrowDown from CTA → Season tabs (lands on active season, NOT prev)
- ArrowRight ×N → target season
- ArrowDown → episode list, row 1
- ArrowDown ×M → target episode
- Enter → play

Minimum for "S1E1" (already-active season) = `Down` (to seasons) + `Down` (to eps, row 1) + `Enter` = **3**. OK.
Minimum for "S3E3" = `Down` + `Right Right` + `Down` + `Down Down` + `Enter` = **7**. Spec says 3; that's **only true** for row-1 of the currently-active season. Claim is narrow.

- **Fix:** table should state "3 inputs for row-1 of active season; +N for other rows/seasons". The 11-input worst case is buried in prose.

### 2.2 Series spec — "Resume in ≤1 input" is ambiguous (`02-series.md:27-28`)
Both rows claim "1 (Continue CTA auto-focus) + Enter". That's **2 key events** (focus is free, Enter is input). The table also claims "1 (hero auto-focus, Enter)" — either you count the Enter or you don't, but the table counts it for some rows and not others.
- **Fix:** define what "1 input" means at the top of the table. Every other spec counts Enter-to-play as an input.

### 2.3 Movies spec — "cold login 11 → 4 inputs" double-counts or under-counts (`03-movies.md:361-362`, `03-movies.md:373-381`)
- "Current (11): login (4) + dock Right/Enter to Movies (2) + …": login is 4 presses? Login is username + password + Enter — that's not 4 discrete inputs in Fire TV remote terms unless on-screen keyboard is counted per letter. Inconsistent with Search §B.5 where letters-per-char is counted as **4 inputs** (ArrowDown to OSK row + ArrowRight ×N + OK = ~4 per letter). If admin / Testing@1234 is used, login is hundreds of remote presses.
- "Designed (4, post-login)": table headline says 11→4 but the detail starts "budget starts at dock". Those are different baselines — the header does not say "excluding login".
- **Fix:** Movies §6 table must state "dock-focused baseline" in the column header and drop the "login (4)" term.

### 2.4 Search spec — "recent-query 2 inputs" skips zero-state nav (`04-search-and-language-rail.md:289`)
Claim: "Play Telugu movie 'Vikram' … recent-search path = **2 inputs**".
Zero-state screen (B.2.1) shows `RECENT` row, `TRENDING` row, `CONTINUE WATCHING` row. On mount `SearchRoute.tsx:148` focuses `SEARCH_INPUT`, not the recent-chip row. To get to the recent chip: `ArrowDown` from input to `RECENT` row → `ArrowRight` ×N to target chip → Enter = **3+** inputs minimum. Spec's 2 assumes focus lands on the first RECENT chip — but §A.3 explicitly says the rail does not steal focus.
- **Fix:** §B.5 table header must say "focus already on chip" or add the 1 ArrowDown to all "recent" column numbers.

### 2.5 Movies "8-input multi-facet" is optimistic
`03-movies.md:384-387`: "Up → Right → Enter (drawer) + Right×N → Enter (genre) + Down → Right-drag (year) + Down×2 → Enter (Apply)". The "Right-drag (year)" counts as 1 input; on Fire TV a range slider is at least Left + Right ×K + Down + Right ×K = 10+ inputs alone. §6 acknowledges this ("Fire TV year slider is a known pain point") but the budget table doesn't reflect the fallback cost.
- **Fix:** either replace the slider with "From/To chips" (spec's own fallback) and recount, or add "year slider cost not counted" footnote.

### 2.6 IA "Live 3 presses" assumes pre-primed dock but ignores language rail
`00-ia-navigation.md:264, 282-287`: 3 presses claim requires `rail pre-filters to Telugu → focus lands on first Telugu channel`. That collapses "ArrowUp to rail → Telugu chip → ArrowDown back to grid" to zero, which is only true on returning sessions with `sv_lang_pref` set and only if the Live grid auto-focuses the filtered list on mount. Today `LiveRoute.tsx:178` defaults `languageFilter = "all"` explicitly, not from storage. Under the spec's rules, that changes; fine. But the budget table does not list "first-ever session cost" the way Movies §6 does ("One-time cost").
- **Fix:** add first-session row to the IA budget table or footnote parity with Movies.

---

## 3. Backend feasibility

### 3.1 BLOCKER WARNING — Handoff P0 description is wrong; Series backend already has what Series spec needs
- Handoff P0 #1 (`streamvault-v3-session-2026-04-22-handoff.md:62`): "`/api/series/info/:seriesId` returns a flat CatalogItem today; backend needs to expose seasons → episodes".
- Actually: `series.router.ts:45` calls `getProvider().getSeriesInfo()`. `xtream.provider.ts:210-234` calls `adaptSeriesInfo(raw, seriesId)` which returns a **full CatalogItemDetail** with `seasons: SeasonInfo[]` and `episodes: Record<string, EpisodeInfo[]>` — see `provider.types.ts:60-71` and `xtream.adapters.ts:89-135`. Adapter tests confirm mapping of seasonNumber, episodeNumber, containerExtension, plot, icon, added.
- Series spec §6 (`02-series.md:369-396`) correctly notes "the backend fields exist in the type system". It's the *handoff* that's outdated.
- **Implication:** the Series P0 is **primarily a frontend fix** (new `/series/:id` route + schema + opener contract change at `usePlayerOpener.ts:21-44`). No backend work blocks it. **This is the smallest blast-radius PR** — see §7.
- **Fix:** update handoff doc. Series spec should say "backend already returns seasons+episodes; verified 2026-04-22 in xtream.adapters.ts:89-135" instead of the softer "verify".

### 3.2 BLOCKER — Movies spec depends on two endpoints that do not exist
- `GET /api/vod/search` (`03-movies.md:399-402`) — does NOT exist. `vod.router.ts` exposes only `/categories`, `/streams/:catId`, `/info/:vodId`. Nothing accepts `?lang=`, `?genre=`, `?year_min=`, `?sort=`.
- `GET /api/vod/facet-counts` (`03-movies.md:403`) — does NOT exist.
- Both would read from `sv_catalog`. Schema (`postgres/03-phase3-services.sql:8-24`) has `name, category_id, icon, is_adult, rating, genre, year, added_at`, plus a `search_vector` GIN index. No `lang` column, no multi-value tag column, no `container_extension`. Year is `TEXT` not `INT`, so `year_min`/`year_max` requires CAST.
- 61,442 VOD rows. Facet counts per-facet (lang × genre × year × rating) over that table with filter-minus-one semantics is a GROUP BY per facet per request. Doable but needs materialisation if <200ms is the target.
- The spec labels these "P0 (design can't ship without these)" but also states at the top "P2 #9 Postgres migration is a prereq" (`03-movies.md:8`). Those two statements mean Movies's P0 design transitively blocks on the P2 item. **Movies spec is NOT P0-shippable** — Series is.
- **Fix:** Movies spec must tag itself P2. Or downgrade to "P0.5: language rail only" and defer facet drawer until the Postgres-backed search endpoint lands.

### 3.3 BLOCKER — `langTags` column doesn't exist; migration non-trivial
- Search §B.7 #7 (`04-search-and-language-rail.md:312-314`) tags this "P0" and says "precomputed at catalog-sync time".
- `sv_catalog` has no `lang_tags` column (`postgres/03-phase3-services.sql:8-24`). Needs: ALTER TABLE + sync pipeline update + backfill over 88,776 rows.
- Even then, where does the language come from? Xtream VOD items don't carry a language field; the current LiveRoute derives it from **category name** (`LiveRoute.tsx:184-203` — pattern match on strings like "Telugu", "Hindi"). For VOD/series, that inference has to happen server-side during sync. That's an NLP-style categorization step that depends on category names being stable.
- **Fix:** Search spec should downgrade #7 to "P1 with backfill plan"; provide the migration script + a fallback that computes lang on the fly from category name (what LiveRoute already does, lifted to backend). Flag this as the single riskiest item in the ecosystem.

### 3.4 MAJOR — Series spec's `sv_history.series_id` migration is actually `sv_watch_history`, and nontrivial
- Series spec §6 (`02-series.md:431-437`) proposes `sv_history.series_id` column.
- Real table is `sv_watch_history` (history.router.ts:15). Schema presumably has `content_id`, `content_type`, `content_name` (Zod at `schemas.ts:221-231` confirms).
- Adding `series_id` to existing rows is a backfill problem: for existing episode-level history rows, how do we learn the series id? Only path is to fetch each episode's series parent from Xtream or cross-reference `sv_catalog`. 61k+ rows might be touched.
- Spec calls out option (b) "derive on client from content_name prefix (brittle — avoid)" — yes, avoid, but option (a) is not free.
- **Fix:** spec must propose a migration — e.g. populate `series_id` only for NEW writes and let old rows NULL out (series "progress" chip absent for pre-migration history). Or backfill via a one-shot script with provider cache. Flag: cannot ship P0 without a plan.

### 3.5 MINOR — Movies `added_at` rename
Movies §7a asks `added_at` on sv_catalog. Already exists (`postgres/03-phase3-services.sql:20`). Spec already hedges ("just needs to land in the API response"). Fine; only noting the claim is correct.

---

## 4. Fire TV / 10-foot UI

### 4.1 BLOCKER — Year slider is a dead affordance on Fire TV
Movies §1c (`03-movies.md:96-98`): ASCII shows `├──●━━━━━━━━━━━━●───┤` dual-handle range slider. Fire TV remote has no pointer; two-thumb sliders require focus-switching between handles via a chord that norigin doesn't model out-of-box. The spec's own fallback (§6 "fall back to From/To chip pickers") concedes this but the main wireframe ships the slider.
- **Fix:** make From/To chip pickers the primary affordance; kill the slider entirely.

### 4.2 MAJOR — `webkitSpeechRecognition` voice search is aspirational
Search §B.1 (`04-search-and-language-rail.md:158`): "`webkitSpeechRecognition` detection on mount. If present, render a mic chip".
- Fire TV Silk browser's speech recognition has been unreliable-to-broken for years, and the Fire TV OS microphone button (remote mic key) is NOT exposed to web apps — that's a Fire OS native-app API.
- The "long-press OK on the input also triggers voice" is also a chord that norigin/HTML don't route to a browser speech API.
- Spec acknowledges "Fall back gracefully when unavailable" — but the click-budget table (B.5) **awards** voice a 2–3-input cost *and* ranks it as the "target hit" ("voice gets it in 3"). Feature-detection success rate on real Fire TV is near zero.
- **Fix:** drop voice from MVP scope; remove from B.5 budget table; move to "Future".

### 4.3 MAJOR — Long-press OK is not a norigin primitive
- Series §3 (`02-series.md:266-284`), Movies §2b (`03-movies.md:207-210`) rely on "Long-press OK (>500ms)" to open bottom sheet / quick-actions popover.
- Norigin spatial-nav has no long-press hook. `useFocusable`'s `onEnterPress` fires on keyup. Implementing hold-detection means bypassing norigin — raw keydown/keyup listeners per focused card.
- Fire TV remote OK is `Enter`; in the browser, repeated Enter keydowns also fire if user holds. Distinguishing "one slow press" from "fast double-press" requires a debounce state per card.
- **Fix:** pick one path and scope it. Recommend: replace long-press OK with a visible menu button (Movies `03-movies.md:224` already shows "ⓘ More info" below focused card — lean on that exclusively).

### 4.4 MAJOR — Enter-hold = Mark-watched quick action on episode rows
Series §3 (`02-series.md:266-268`): "Press-and-hold Enter / remote OK for 500ms on a focused episode row → bottom sheet slides in". Same problem as §4.3 and a hidden affordance (violates spec's own "no hidden menus" principle, `03-movies.md:232`).
- **Fix:** add a visible chevron "⋯" on focused row; make it the sheet trigger.

### 4.5 MAJOR — 40px min hit target is called out, but card wireframes don't show compliance
- IA §6.4 rule 3 (`00-ia-navigation.md:376`) asserts "40px min hit target".
- Movies poster at 1080p 6 cols — usable width ~1800, poster ~280 wide OK. But Series `/series/:id` episode row state glyphs `○ ● ✓ 🔒` (§2 `02-series.md:218-234`) show as single-character icons on the right edge — their rendered bounding box is ~20px wide.
- Movies card meta row `2024 · 2h · ⓘ More info` (`03-movies.md:223-228`): the ⓘ link is a sub-focus inside a poster card — norigin doesn't support sub-focusables inside a focused card without careful wrapping, and the hit target on the icon alone is <30px.
- **Fix:** (a) state glyphs on episode rows are read-only, not focusable — confirm in spec. (b) "ⓘ More info" on focused card needs full-row hit area, not the 20-px icon.

### 4.6 MAJOR — Typing on Fire TV remote
Every spec assumes the user types. Search §B.5 budgets 4 inputs per letter, but:
- No spec addresses on-screen keyboard **focus trap** — when OSK opens, norigin focus jumps to an iframe that norigin doesn't own.
- Search's `Placeholder rotates trending term every 4s` (`04-search-and-language-rail.md:160`) — on a focused input, changing placeholder every 4 s can reset screen-reader announcements and OSK state.
- **Fix:** drop rotating placeholder. Specify OSK focus-return behavior (on OSK close, focus returns to input; not documented anywhere).

### 4.7 MINOR — Media-key reveal assumptions
IA doesn't mention, but PR #48 shipped media-key reveal. None of the specs account for remote **Menu** key; Series spec §6.5 (`00-ia-navigation.md:391-393`) says "Menu key on Fire TV remote (norigin `onArrowPress("left")` at edge cases conflicts)". That's a real conflict not resolved.

---

## 5. Wireframe credibility

### 5.1 MAJOR — Movies bottom sheet overlaps Player on Series detail
Movies §3 shows sheet at ~60% viewport. The PlayerShell is global (`App.tsx:144`) and z-indexes above everything. Sheet + Player could be simultaneously visible if a user right-clicks a poster while a Live channel is playing (picture-in-picture isn't supported, but the state exists: Player is "open" while the sheet opens over it). Neither spec addresses Player-open-while-sheet-opens.
- **Fix:** Movies §3 must say "sheet suppressed while Player is open" or equivalent.

### 5.2 MAJOR — Series "Seasons as horizontal chips" scalability (`02-series.md:203-208`)
Spec says chips > dropdown. Then concedes "if a series has >8 seasons (rare; daytime TV), collapse into a dropdown." Fire TV horizontal chip rows wider than viewport need their own inner scroll/focus semantics; norigin wraps ArrowRight at last element by default (and this spec's IA §A.4 explicitly turns off wrap). Chip row at `>5` seasons at 1080p already doesn't fit. **The 8-season threshold is arbitrary** — a 1920px rail with 160px chips + 16px gap fits 10 chips. The threshold should be viewport-derived, not constant.
- **Fix:** compute from viewport or cap at 6 visible; add horizontal scroll semantics spec.

### 5.3 MAJOR — Facet drawer as "sibling focus region not a modal" (`03-movies.md:108`)
Drawer open, grid dimmed to 40%, dock still visible (z=100). Drawer is not focus-trapped. ArrowLeft from first drawer chip → where? If it walks back to the grid behind, that's hostile. If it stays, that's inconsistent. Spec doesn't say.
- **Fix:** explicit focus-trap behavior for drawer; ArrowLeft on drawer first chip = no-op; Back = close drawer.

### 5.4 MINOR — Hero layout breaks at 1080p with long titles (`02-series.md:120-130`)
Poster (20ch width) + "Series Title ★ 4.2 · 2023 · Drama" + Synopsis 2–3 lines + Primary CTA + 3 action buttons = ~700-800px tall. At 1080p, seasons rail drops below the fold in non-common cases. Spec doesn't spec a min-viewport or collapse behavior.

### 5.5 MINOR — "Similar" row inside Movies sheet (`03-movies.md:258-261`)
Implies a `/api/vod/similar/:id` endpoint. Doesn't exist. Not called out in §7. Ships as dead UI.

---

## 6. Silent omissions

### 6.1 BLOCKER — i18n UI vs content-language conflation
All four specs use "Telugu/Hindi/English" as content filters. None specify that the **app UI language is English** (strings in LiveRoute/Movies/Series are hardcoded English). The rails use `తెలుగు` rendering on cards (`02-series.md:60-61`), mixing localised content metadata with English UI. Fine, but no spec states the rule explicitly, and a user changing "language" on the rail doesn't change the UI strings — which is *correct* but confusing if unstated.
- **Fix:** one line in IA §4 stating "Language rail filters CONTENT only; app UI remains English. No i18n for chrome."

### 6.2 MAJOR — Accessibility (ARIA, focus-visible, reduced-motion)
- Search spec has the most explicit a11y (§B.8 `04-search-and-language-rail.md:316-322`) — good.
- Movies spec: nothing except "all affordances reachable without hover" (§1 `03-movies.md:13`).
- Series spec §9 covers aria-labels and focus rings — good.
- IA: no accessibility section.
- No spec addresses **reduced-motion** (`prefers-reduced-motion`). The "copper glow" focus ring, "ambient copper glow" background, sheet-slide animations all need a reduced-motion variant.
- **Fix:** IA adds a §8 "Cross-cutting a11y": ARIA roles for each rail/toolbar/grid pattern; required focus-visible treatment; reduced-motion opt-out for motion tokens.

### 6.3 MAJOR — Offline / stale catalog data
Handoff notes catalog syncs "every 2h live / 6h vod/series". Movies §1 claims "12,453 movies" counts; in reality that count changes only every 6h. Facet counts (§1c "Apply (N)") can be stale by hours. No spec addresses staleness UX (e.g. timestamp, "last updated 4h ago", refresh hint).
- **Fix:** Movies §1c — acknowledge counts are catalog snapshot, not provider live. Probably not worth surfacing to user; but must not market as "live count".

### 6.4 MAJOR — Grid virtualization for 61k movies
Movies §1 (`03-movies.md:29-31`): "Infinite scroll, 60-item pages, sticky scroll position on back."
- No virtualization mentioned. A user scrolling past 10 pages = 600 cards rendered. Chromium on Fire TV Silk chokes at ~1000 DOM nodes with images.
- Norigin focus scan walks all focusables; at 600 cards that is 600+ `useFocusable` calls per render.
- "Sticky scroll position on back" (`03-movies.md:29-30`) conflicts with virtualized lists — windowing libraries don't trivially restore scroll on popstate.
- **Fix:** Movies spec must mandate virtualization (react-virtuoso or react-window) and address focus-key persistence across unmount/remount.

### 6.5 MAJOR — Analytics / telemetry silence
None of the four specs mention telemetry. How will we know if the click-budget targets are hit? How will we know if users discover the bottom sheet? Without an event schema, the post-launch loop has no signal.
- **Fix:** IA §6.5 adds "telemetry events fired on every rail pick, every sort change, every Player open/close with kind+source". One-line addition.

### 6.6 MINOR — Real-time freshness claims
Search §B.6 "Trending in <pinned lang>" — `/api/trending?lang=telugu&limit=8` — "Refreshed server-side daily." Daily and 4s-rotating-placeholder is fine, but Continue Watching uses `/api/history` — that's user-specific and stale-free. No spec states the refresh policy per rail.

### 6.7 MINOR — Logout behaviour (Series spec mentions, others don't)
Series §7 (`02-series.md:451`): "Cleared by the same `clearHistoryLocalStorage()` logout pattern." Movies §4 does not. IA §4.2 "persistence" doesn't name logout clearing. If user logs out, does `sv_lang_pref` survive (shared Fire TV household use case)?
- **Fix:** IA §3.4 add a column "Cleared on logout?" to the persistence table.

### 6.8 MINOR — Favorites/History star gesture undetermined (`00-ia-navigation.md:389-391`)
IA §6.5 flags "long-press or dedicated button? Recommend: Menu key". Menu key conflict already noted §4.7. Parked, not resolved.

### 6.9 MINOR — `CatalogItemDetail.containerExtension` usage
Movies spec §7b wants `container_extension` per item for tier-lock badging. Backend type `provider.types.ts:66` has `containerExtension?: string` at the item **detail** level (single-item fetch), not in the browse list (`CatalogItem` has no such field). To badge in-grid, every card would need a detail fetch — N+1 explosion. Fix: backfill `container_extension` into `sv_catalog` table as a column (schema change).

---

## 7. Ranked top 10 findings to fix BEFORE any implementation starts

1. **§3.2 — Movies spec is not P0-shippable.** The `/api/vod/search` and `/api/vod/facet-counts` endpoints don't exist and transitively block on P2 #9 sv_catalog migration for VOD. Demote Movies spec to P2, OR scope Movies P0 to "just the LanguageRail + existing `/api/vod/streams/:catId`" with filters done client-side.
2. **§1.1 — Unify localStorage on `sv_lang_pref`.** Delete `sv_series_lang` and `sv_movies_lang` from specs 02 and 03. Single read path, single write path.
3. **§3.3 — `langTags` is not P0.** Downgrade to P1; specify a first-phase fallback using `LANGUAGE_PATTERNS` on the backend (lift from LiveRoute).
4. **§3.4 — `sv_watch_history.series_id` migration plan needed.** Spec the backfill strategy (or accept NULL for pre-migration rows) before Series spec lands; the table name is `sv_watch_history`, not `sv_history`.
5. **§3.1 — Correct the Series handoff claim.** Backend `adaptSeriesInfo` already returns `seasons[] + episodes{}` with stream IDs. Series P0 is frontend-only. Write this into 02-series §6.
6. **§1.2 + §1.3 — Nail the card-activation + back-stack matrix.** IA §2.2 needs per-surface Enter semantics and IA §2.3 needs the exact Player-sentinel behavior from PlayerProvider.tsx:85-96 written down. Otherwise Series detail back-stack is a shipping bug.
7. **§4.1 — Replace year slider with From/To chip pickers** in Movies §1c and §6. Fire TV sliders are a no-go.
8. **§4.2 — Drop voice search from Search spec MVP.** Rewrite §B.5 budget without the voice column.
9. **§4.3 + §4.4 — Replace all long-press OK affordances** with visible "⋯" menu triggers. No hidden chord UX.
10. **§6.4 — Mandate virtualization for Movies grid** or cap the grid at K items. 61k rows + infinite scroll without windowing = DOM OOM on Fire TV.

---

## Smallest-blast-radius first PR recommendation

**Ship the Series P0 fix first. It is pure frontend and unblocks the single highest-value user flow.**

Scope:
1. New route `/series/:id` in `src/App.tsx:131` routes table.
2. New `SeriesDetailRoute.tsx` using the **already-existing** `CatalogItemDetail` with `seasons + episodes` from `GET /api/series/info/:id` (no backend change).
3. New frontend Zod schemas `SeasonInfoSchema`, `EpisodeInfoSchema`, `SeriesInfoSchema` in `src/api/schemas.ts` mirroring `provider.types.ts:41-71`.
4. Fix `usePlayerOpener.ts:21-44` / `SearchResultsSection.tsx:36` — series-hit path calls `navigate('/series/' + id)` not `openPlayer`.
5. Hero CTA auto-focus with Play S1E1 / Continue S_E_ logic (reads `sv_watch_history` via existing `/api/history`).

Non-goals for first PR (move to follow-ups):
- `sv_lang_pref` unification (contentious, cross-spec).
- `sv_watch_history.series_id` migration (backend work).
- Movies facet drawer (needs `/api/vod/search`).
- LanguageRail extraction to shared component.
- Voice / long-press / bottom sheet.

**Blast radius:** 1 new route, 1 new schema block, 2 function edits (opener + search section), 0 backend changes, 0 migrations. Ships the P0, confirms the back-stack matrix empirically, and sets up the LanguageRail extraction as PR #2.

SAVED: /home/crawler/streamvault-v3-frontend/docs/ux/99-grill-findings.md
