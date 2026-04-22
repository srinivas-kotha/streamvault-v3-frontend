# 04 — Search and Language Rail UX Spec

**Status:** Design-only — no code.
**Surfaces affected:** Live, Movies, Series, Search (global rail); Search route (redesign).
**Related:** handoff 2026-04-22 P0 #2 (persist language), P1 #6 (series opens player bug).

---

## Part A — Global Language Rail

The rail currently lives only in `LiveRoute.tsx`. Promote it to a cross-surface primitive: `<LanguageRail />`, rendered as the top row of the toolbar on every browse surface (Live, Movies, Series, Search).

### A.1 Component API

```tsx
<LanguageRail
  surface="live" | "movies" | "series" | "search"
  value={lang}                 // controlled
  onChange={setLang}
  counts?={Record<LangId, number>}   // optional, disables chips with 0
  overflow?={LangId[]}         // Tamil, Malayalam, Kannada, ...
/>
```

Chips, left-to-right:

| Chip      | Live | Movies | Series | Search |
|-----------|:----:|:------:|:------:|:------:|
| Telugu    |  Y   |   Y    |   Y    |   Y    |
| Hindi     |  Y   |   Y    |   Y    |   Y    |
| English   |  Y   |   Y    |   Y    |   Y    |
| Sports    |  Y   |   —    |   —    |   Y*   |
| All       |  Y   |   Y    |   Y    |   Y    |
| `More ▾`  |  Y   |   Y    |   Y    |   Y    |

\* On Search "Sports" is shown only if the query matches a sports term (e.g. "cricket") OR the kind filter is set to Live.

**Why:** Movies/Series have no concept of a sports feed; hiding the chip reduces cognitive load and prevents 0-result dead ends on those surfaces.

### A.2 State model — one global key

Unify `sv_live_lang` (handoff P0 #2) and any future per-surface keys into a **single** localStorage key:

```
sv_lang_pref = "telugu" | "hindi" | "english" | "sports" | "all" | <overflow id>
```

- **Default** on first launch: `telugu` (user's primary per requirements).
- **Scope:** global. Set on any surface → respected everywhere on next mount.
- **Per-surface "All" override:** non-destructive. If user picks "All" on Movies, we set a session-only `sessionStorage.sv_lang_session_override = "all"` scoped to that surface; `sv_lang_pref` is **not** overwritten. Leaving the surface and returning restores the pinned pref.
- **"Sports" on Live:** writing "sports" to the global pref is allowed; on Movies/Series mount we fall back to the user's prior non-sports choice (tracked as `sv_lang_pref_fallback`), defaulting to `telugu` if absent.

_Why one key:_ the user wants Telugu-first results everywhere with a single setting. Per-surface keys force them to re-pin on every page. The `sv_lang_pref_fallback` shim solves the Sports-is-Live-only edge case without losing the user's true preference.

### A.3 Focus behavior on mount

- **Does not steal focus.** `focusable: false, trackChildren: true` wrapper (same pattern as `CONTENT_AREA_LIVE`).
- From the dock (`ArrowUp`), norigin forwards focus to the **first** registered child — the first language chip. User feels "up goes to filters."
- From the chip row, `ArrowDown` exits to the next toolbar row (sort/EPG on Live, sort on Movies/Series, results on Search).
- On Search the rail renders **only after** `lastSearchedQuery.length >= 2`; before that the input keeps focus.

_Why:_ Mount-time focus-steal is disorienting when the user is mid-scroll. Letting norigin route via `trackChildren` keeps dock→content→rail→grid linear.

### A.4 Wraparound

- `ArrowRight` on the last visible chip (before `More ▾`) → opens `More ▾`.
- `ArrowRight` on `More ▾` (closed) → wraps to first chip.
- `ArrowLeft` on first chip → stays (no wrap — prevents accidental overflow open).
- `ArrowDown` from any chip → first element of the next toolbar row.
- `ArrowUp` from any chip → dock (by norigin's natural fall-through).

_Why no left-wrap:_ On Fire TV, left-wrap to overflow menus is a known source of unintentional menu opens during scroll-back gestures.

### A.5 Wireframes — 5 states

**A.5.1 Default (Telugu active, Movies surface)**

```
+--------------------------------------------------------------+
|  [ Telugu ]  Hindi   English   All   More v                  |
+--------------------------------------------------------------+
|  SORT: Name | Year | Rating                                   |
+--------------------------------------------------------------+
|  [poster] [poster] [poster] [poster] [poster]                 |
```

**A.5.2 Telugu active, with counts (Search surface)**

```
+--------------------------------------------------------------+
|  [ Telugu 142 ]  Hindi 88  English 53  (Sports 0)  All 317    |
+--------------------------------------------------------------+
                                     ^ dimmed — 0 results in this facet
```

**A.5.3 Overflow open**

```
+--------------------------------------------------------------+
|  Telugu  Hindi  English  All  [ More v ]                      |
|                                +--------------------+          |
|                                | Tamil       3,459  |          |
|                                | Malayalam   1,187  |          |
|                                | Kannada       612  |          |
|                                | Marathi       298  |          |
|                                | Punjabi       177  |          |
|                                +--------------------+          |
+--------------------------------------------------------------+
```

D-pad: `ArrowDown` inside overflow walks the list; `Enter` pins that language and closes the menu; `Back` closes without changing state.

**A.5.4 Disabled chip (Sports has 0 matches in current query)**

```
+--------------------------------------------------------------+
|  Telugu   Hindi   English   Sports   All                      |
|                              ^^^^^^                           |
|                              dimmed 40% opacity               |
|                              aria-disabled="true"             |
|                              D-pad skips it (norigin focusable:false)
+--------------------------------------------------------------+
```

**A.5.5 Live surface (has Sports)**

```
+--------------------------------------------------------------+
|  Telugu   Hindi   English   [ Sports ]   All   More v         |
+--------------------------------------------------------------+
|  SORT: Number | Name | Category      EPG: All | Now | 2h      |
+--------------------------------------------------------------+
|  split guide  |                       EPG programme card      |
```

### A.6 D-pad path (authoritative)

```
Dock(Live)  --ArrowUp-->  LanguageRail[first chip]
                                |  ArrowRight --> next chip ... --> More v
                                |  ArrowLeft  --> prev chip (stop at first)
                                |  ArrowDown  --> SortRow[first button]
SortRow     --ArrowDown-->  ContentGrid[first card]
ContentGrid --Back-->       Dock[active tab]
```

---

## Part B — Search UX Redesign

Evolves `SearchRoute.tsx` (PR #35) to address: 2-char floor, remote typing pain, language-pinned ordering, series-result routing bug (P1 #6), and recovery from no-results.

### B.1 Search input + debounce

- **Minimum query length:** 2 chars (backend `searchSchema` — confirmed in `search.router.ts`).
- **Debounce:** **250ms** on input change (tighten from current 300ms — shaves a frame off every keystroke on Fire TV where typing already feels laggy).
- **Enter bypass:** immediate fire on `Enter` / `OK` (already implemented — keep).
- **Voice:** `webkitSpeechRecognition` detection on mount. If present, render a mic chip right of the input; long-press `OK` on the input also triggers voice. Fall back gracefully when unavailable (Fire TV Silk supports it intermittently — feature-detect, never assume).
- **Placeholder rotates trending term for the user's pinned language every 4s** (e.g. "Search... try 'vikram'"). Gives the user a typable example.

_Why 250ms, not 150ms:_ sv_catalog FTS on 88k rows is fast but not free; 250ms still feels instant and halves the request count vs 100ms while the user types a 5-letter query (5 → 2–3 requests instead of 5).

### B.2 Wireframes — 6 states

**B.2.1 Empty state (no query)**

```
+------------------------------------------------------------------+
|  [ ?  Search... try "vikram"                    ][ mic ]         |
+------------------------------------------------------------------+
|  RECENT                                                          |
|  vikram    |  rrr     |  money heist  |  ipl   |  breaking bad   |
|                                                                  |
|  TRENDING IN TELUGU                                              |
|  [poster] [poster] [poster] [poster] [poster] [poster]           |
|                                                                  |
|  CONTINUE WATCHING                                               |
|  [poster 43%] [poster 12%] [poster 89%]                          |
+------------------------------------------------------------------+
```

_Why:_ Fire TV users dread typing. Three zero-keystroke paths (recent, trending, continue) mean most sessions finish with **zero** typed characters.

**B.2.2 Typing, <2 chars**

```
+------------------------------------------------------------------+
|  [ v                                           ][ mic ]          |
+------------------------------------------------------------------+
|  Keep typing... (2 characters minimum)                           |
|                                                                  |
|  TRENDING IN TELUGU                      < still visible >       |
|  [poster] [poster] [poster] [poster]                             |
+------------------------------------------------------------------+
```

Trending stays visible so the user has an out without erasing.

**B.2.3 Typing, >=2 chars — results (pinned lang first)**

```
+------------------------------------------------------------------+
|  [ vikra                                       ][ mic ]          |
+------------------------------------------------------------------+
|  [ Telugu 4 ]  Hindi 2   English 1   All 7                       |
|  KIND: All | Live | Movies | Series      YEAR: any v             |
+------------------------------------------------------------------+
|  MOVIES (4)                              See all in Movies ->    |
|  [Vikram 2022 TE] [Vikram Vedha TE] [Vikramarkudu TE] [...]     |
|                                                                  |
|  SERIES (2)                              See all in Series ->    |
|  [Vikrant Rona TE]  [Vikram HI]                                  |
|                                                                  |
|  LIVE (1)                                                        |
|  [Vikram News 24x7]                                              |
+------------------------------------------------------------------+
```

Within each section: the 4 Telugu hits sort **before** the 2 Hindi hits, before the 1 English hit. Sort key: `(langMatchesPinned ? 0 : 1, -rating, name)`.

**B.2.4 No results**

```
+------------------------------------------------------------------+
|  [ zxcvq                                       ][ mic ]          |
+------------------------------------------------------------------+
|  No results for "zxcvq".                                         |
|  Try a shorter query or a different language.                    |
|                                                                  |
|  TRENDING IN TELUGU                                              |
|  [poster] [poster] [poster] [poster]                             |
+------------------------------------------------------------------+
```

**B.2.5 "Did you mean"**

```
+------------------------------------------------------------------+
|  [ vikrem                                      ][ mic ]          |
+------------------------------------------------------------------+
|  Did you mean [ vikram ] ?   ( Enter to search )                 |
|                                                                  |
|  MOVIES (0)  — no results for "vikrem"                           |
+------------------------------------------------------------------+
```

Trigger: Postgres `pg_trgm` similarity from backend (`SELECT name FROM sv_catalog WHERE similarity(name, $1) > 0.4 ORDER BY similarity DESC LIMIT 1`). Frontend reads `results.didYouMean` (new optional field).

**B.2.6 Error state**

```
+------------------------------------------------------------------+
|  [ vikram                                      ][ mic ]          |
+------------------------------------------------------------------+
|  ! Search failed. Check your connection.        [ Retry ]        |
+------------------------------------------------------------------+
```

### B.3 Result card routing (fixes P1 #6)

Current bug: `SearchResultsSection` sends `kind: "series-episode"` with just the series id → player buffers forever.

**Spec:**

| Result `type` | Action                                                  |
|---------------|---------------------------------------------------------|
| `live`        | `openPlayer({ kind: "live", id, title })`               |
| `vod`         | `openPlayer({ kind: "movie", id, title })`              |
| `series`      | `navigate('/series/' + id)` — **NEVER openPlayer here** |

**Rationale:** A series id is not a streamable stream_id. Clicking a series must land on the season/episode picker (`/series/:id`, landing in Phase 4 per handoff TODO P0 #1). This change is a prerequisite for the episode picker but can ship **independently**: even without the picker, `/series/:id` can render a `"Episode picker coming soon"` placeholder — better than a buffering player.

### B.4 Filter facets

Facet row renders below the input once `hasResults`. Three controls:

1. **Language chips** — the same `<LanguageRail surface="search" />` from Part A. Pinned-lang chip active by default. Selecting a chip narrows results client-side (no refetch; results arrive pre-enriched with language tag per item) and re-sorts.
2. **Kind toggle** — `All | Live | Movies | Series`. Purely presentational; hides sections.
3. **Year range** — dropdown, VOD-only. Options: `Any | 2020+ | 2010–2019 | 2000–2009 | pre-2000`. Hidden when Kind = Live.

D-pad: facets are a horizontal row; `ArrowDown` from any facet enters the first section header → first card.

### B.5 Click / keypress budget

Assumes Fire TV remote; on-screen keyboard is D-pad-navigated, average **3 D-pad moves + 1 OK** per letter.

| Task                                          | Inputs (typed)   | Inputs (voice)  | Inputs (recent) |
|-----------------------------------------------|------------------|-----------------|-----------------|
| "Play Telugu movie 'Vikram'" (5 letters)      | 5 letters × 4 + 1 OK on top result = **21** | 1 long-press + say + **1 OK** = 2–3 | 1 `ArrowDown` + **1 OK** = 2 |
| "Play live channel 'TV9 Telugu'"              | 3 letters ("tv9") × 4 + 1 = **13**      | 2–3             | 2 (if recent)   |
| "Resume series 'Money Heist' S2E4"            | 5 letters × 4 + `ArrowDown` to series + **1 OK** → lands on `/series/:id` → `ArrowDown` to S2 + `ArrowRight` × 3 + **1 OK** = **~27** | ~10 (voice + 6 d-pad inside picker) | 2 (recent) + 5 (season/ep nav) = **~7** |
| Ambiguous query "ipl"                         | 3 letters × 4 + `ArrowRight` through lang chips to pin + **1 OK** + `ArrowDown` to live result + **1 OK** = **~16** | ~4             | ~2              |

**Target hit:** "Play Vikram" in recent-search path = **2 inputs**, well under the 6-input (5 letters + 1 OK) target. Even cold, voice gets it in 3.

### B.6 Empty state rails (detail)

- **Recent searches** — last 5 queries, newest first. Tapping re-runs the query (bypasses debounce). Backend-persisted (see B.7). Swipe/long-press → delete. On first launch (no history), the whole section is omitted, not rendered empty.
- **Trending in <pinned lang>** — 8 posters horizontally scrollable. Backend endpoint `/api/trending?lang=telugu&limit=8` returning `CatalogItem[]`. Refreshed server-side daily.
- **Continue watching** — reuses `/api/history` with `progress_seconds < duration_seconds * 0.95`, limit 6. Already available client-side.

### B.7 Data contract asks (backend)

| # | Endpoint                                | Purpose                                                                                 | Priority |
|---|-----------------------------------------|-----------------------------------------------------------------------------------------|----------|
| 1 | `GET /api/search/recent` → `string[]`   | Per-user last 10 queries (writes on every successful search from frontend)              | P1       |
| 2 | `POST /api/search/recent` `{q}`         | Idempotent upsert                                                                       | P1       |
| 3 | `DELETE /api/search/recent/:q`          | User-initiated removal                                                                  | P2       |
| 4 | `GET /api/trending?lang=telugu&limit=8` | Editorial + play-count weighted top items; per-language                                 | P1       |
| 5 | `GET /api/search?q=…&facets=1`          | Response extended with `facetCounts: {lang: {telugu:42, hindi:19, …}, kind: {...}}`     | P1       |
| 6 | `GET /api/search?q=…&didYouMean=1`      | Response extended with optional `didYouMean: string`                                     | P2       |
| 7 | `CatalogItem` gains `langTags: string[]`| Precomputed at catalog-sync time; enables client-side language re-sort with no refetch  | P0       |

**Why #7 is P0:** Without `langTags` on the item, the frontend has no signal to sort Telugu results above Hindi for a given query. Today we'd have to re-derive from category name on each render (fragile — same issue LiveRoute has with `LANGUAGE_PATTERNS`). Doing it once in catalog-sync is both faster and authoritative.

### B.8 Accessibility

- Input: `aria-label="Search channels, movies, and series"`, `role="searchbox"`.
- Results: live region `aria-live="polite"` on the section container; each section has `role="region" aria-label="Movies results"`.
- Facet chips: `role="radio"` inside `role="radiogroup" aria-label="Filter by language"`.
- Disabled chip (0 results): `aria-disabled="true"`, not removed from DOM (count stays as "Telugu 0" for clarity).

### B.9 Migration plan (implementation order)

1. Extract `<LanguageRail />` from `LiveRoute.tsx` into `src/features/language/LanguageRail.tsx` + `useLanguagePref` hook backed by `sv_lang_pref` localStorage.
2. Mount on Movies, Series, Search (surface prop).
3. Ship backend #7 (langTags) — unblocks client-side sort.
4. Fix P1 #6: `SearchResultsSection` routes `type=series` to `navigate('/series/:id')` + temp placeholder page.
5. Ship backend #1–#4 (recent + trending). Add empty-state rails.
6. Debounce 300→250ms. Add `didYouMean` + facet counts.

Steps 1, 2, 4 can ship in a single PR (pure frontend, no backend dep) and immediately eliminate the series-buffering bug plus give the user Telugu-first ordering everywhere.

---

SAVED: /home/crawler/streamvault-v3-frontend/docs/ux/04-search-and-language-rail.md
