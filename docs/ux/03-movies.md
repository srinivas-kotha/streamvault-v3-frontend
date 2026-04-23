# 03 — Movies UX

**Owner:** UX Lead
**Status:** Revised 2026-04-22 against backend reality (supersedes prior Movies spec)
**Scope:** `/movies` route only. Detail view is a bottom sheet on the same route.
**Parent:** `00-ia-navigation.md`

---

## 0. Reality anchor

| Available | Missing |
|---|---|
| `GET /api/vod/categories` — full list of VOD categories | No pagination on anything |
| `GET /api/vod/streams/:catId` — all movies in a category, each with `inferredLang ∈ {telugu, hindi, english, sports, null}` | No `inferredLang` on search results |
| `GET /api/vod/info/:vodId` — detail incl. `plot`, `cast`, `director`, `duration`, `backdropUrl`, `containerExtension` | No `/api/vod/search`, no `/api/vod/facet-counts`, no year/genre/rating server-side filter |
| `GET /api/history` — watch history | No "similar movies" endpoint, no "trending" endpoint |
| `GET /api/favorites` | — |

Catalog size: **~61k VOD rows.** Virtualization is mandatory.

**Design consequence:** Movies is **language-first** with client-side sort and client-side union across categories. Facet drawer (Year / Genre / Rating) is deferred until backend ships a search endpoint.

---

## 1. TL;DR — Decisions

1. **Delete CategoryStrip.** It was the main bug in the prior prod state (Telugu selected + English categories showing → impossible filter state). Categories are invisible UI; users browse by language, not by "ENGLISH FHD (2025)".
2. **4 language chips**: Telugu · Hindi · English · All. No Sports. (Per IA §4.1.)
3. **VirtuosoGrid is mandatory.** DOM card count stays under ~150. 61k items would OOM Silk.
4. **Card Enter = play.** No detail route. Detail is a bottom sheet on the same route. PR #45 stays.
5. **Visible `⋯` overflow menu on the focused card.** Favorites and mark-watched. No long-press.
6. **Filter drawer (Year / Genre / Rating): deferred.** Needs `/api/vod/search`. Listed in `99-grill-findings` as open.
7. **Honest empty state when a language has no movies.** Don't fake "loosen filters" — we have no facet counts.
8. **Client-side sort only**: Added (default) and Name. Year/Rating sort deferred.

---

## 2. Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  MOVIES                                                          │  ← route title, 32px
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [⏮ Continue]  [Telugu*]  [Hindi]  [English]  [All]       │   │  ← LanguageRail (§00-ia §4)
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Sort: [Added*] [Name]                      2,574 movies  │   │  ← Toolbar
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │
│  │ ║█ ║│ │ █  │ │ █  │ │ █  │ │ █  │ │ █  │   ← focus = top-left │
│  │ ║  ║│ │    │ │    │ │    │ │    │ │    │                       │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                       │
│  Title   Title   Title   Title   Title   Title                   │
│  2024    2023    2024    2022    2021    2024                    │
│                                                                  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │
│  │ █  │ │ █  │ │ █  │ │ █  │ │ █  │ │ █  │                       │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Zones top-to-bottom

1. **Route title** "MOVIES" (32px, `--type-title-lg`). Scrolls away with content.
2. **LanguageRail** (sticky? **no** — scrolls with content; re-entering from dock ArrowUp walks back to it). Chips + optional "⏮ Continue" chip (leftmost, conditional on history non-empty).
3. **Toolbar** (sticky **yes** — thin band). Sort segmented control + result count.
4. **Poster grid** (6 cols @ 1080p, 5 @ 1600w, 4 @ 1280w, fully virtualized). Card ratio 2:3.

---

## 3. Data retrieval strategy — "client-side language union"

Movies has no `/api/vod/search`. To show "all Telugu movies", we do this:

```
1. On mount (or lang change): fetch /api/vod/categories once (cached session-wide)
2. Filter categories by applicable lang: `categories.filter(c => inferredLang(c.name) === lang)`
3. Fetch /api/vod/streams/:catId in PARALLEL for every matching category
   (bounded at 8 concurrent; most languages have <20 matching categories)
4. Flatten, deduplicate by `id`, sort by current sort key
5. Feed into VirtuosoGrid
```

Per-language approximate sizes (grill §3.2 estimates, unverified live):

| Language | Categories matching | Approx rows | Notes |
|---|---|---|---|
| Telugu | 10-15 | ~3-8k | Comfortably under memory |
| Hindi | 15-25 | ~5-12k | Largest usually |
| English | 20-30 | ~5-15k | Broad patterns (netflix, hbo) |
| All | all | ~61k | Virtualized — must work |

### 3.1 Caching

- `fetchCategories()` → session cache (stale-while-revalidate, 5min TTL)
- `fetchStreamsByCategory(catId)` → session cache (5min TTL)
- Language-union result → memoized on `(lang, sortKey, rev)`; invalidated when user pulls-to-refresh or changes language

### 3.2 "All" option — lazy

On `lang=all`, don't pre-fetch every category. Fetch lazily page-by-page via VirtuosoGrid's `endReached` callback. Virtuoso knows what's in view; we only fetch categories we're about to render.

### 3.3 When a language is empty

If 0 categories match the language pattern OR all matching categories return empty, show the empty state (§7).

---

## 4. LanguageRail

Full spec in `00-ia §4` and `04-search-and-language-rail §A`. On Movies:

- 4 chips: Telugu · Hindi · English · All. **No Sports chip.**
- Continue-watching chip leftmost when history is non-empty, per `00-ia §6.1`.
- Default on cold mount: `sv_lang_pref` (Telugu out of the box).
- Change → writes `sv_lang_pref`, re-runs §3 fetch plan, focus returns to grid row 1 col 1.

---

## 5. Toolbar

```
┌──────────────────────────────────────────────────────────────────┐
│ Sort: [Added*] [Name]                              2,574 movies  │
└──────────────────────────────────────────────────────────────────┘
```

- **Sort**: segmented control. 2 options.
  - **Added** (default) — by `added` field, newest first
  - **Name** — A→Z, locale-aware (sorts Telugu script correctly)
- **Count**: `N movies` where N is the post-union count. When loading, show `~N` using last-known count so the toolbar height doesn't jump.

**Deferred (backend gap):** Year filter, Genre filter, Rating min, "Most watched" sort. All flagged in `99-grill-findings`.

---

## 6. Card states

Same 2:3 poster. All states composite on identical geometry — no layout shift.

```
 IDLE             FOCUSED              IN-PROGRESS      WATCHED         TIER-LOCKED
 ┌────┐           ╔════╗               ┌────┐           ┌────┐          ┌────┐
 │ █  │           ║ █  ║               │ █  │           │ █ ✓│          │ █ 🔒│
 │    │           ║    ║               │▰▰▰─│           │    │          │    │
 └────┘           ╚════╝               └────┘           └────┘          └────┘
 Title            Title                Title (43%)      Title (dim)     Title
 2024             2024                 2024             watched         Format limit
```

- **Idle**: no chrome.
- **Focused**: 2px copper ring + glow (one `--focus-ring` token).
- **In-progress**: 3px copper progress bar bottom of poster. From `/api/history` intersect.
- **Watched**: 60% opacity + `✓` badge top-right.
- **Tier-locked**: `🔒` badge top-right. **Only possible after a detail pre-fetch** (containerExtension is on `/info`, not `/list` — §0). Tier-locked rendering is **best-effort**: if we haven't fetched detail for that item yet, no badge — user sees normal card and may hit the playback-failure overlay at play-time (§9). Acceptable trade-off.

### 6.1 Focused card — `⋯` overflow button

When a card is focused, a small `⋯` button appears in its title area (not hover — focus only):

```
╔════╗
║ █  ║
╚════╝
Title          ⋯
2024
```

**D-pad:**
- `Right` from focused card → `⋯` button
- `Left` from `⋯` → returns to card
- `Down` from card → next poster row (⋯ is not in the nav grid)
- `Enter` on `⋯` → overflow menu opens below it, first item auto-focused

**Menu items (movie context):**

```
┌────────────────────────────────┐
│  ☆  Add to favorites           │
│  ✓  Mark as watched            │
│  ⓘ  More info (open sheet)    │
└────────────────────────────────┘
```

| Action | Call | Note |
|---|---|---|
| Add to favorites | `addFavorite(movieId, { content_type: "vod", ... })` | Toggles ✕ Remove if already favorited |
| Mark as watched | `recordHistory(movieId, progress=duration, duration=duration)` | Flips card to Watched state |
| More info | Open bottom sheet (§7) | Same as `ⓘ` path but reachable after focus |

**3 presses to favorite a movie:** Right (to ⋯) → Enter (open menu) → Enter (first item) = 3 inputs.

---

## 7. Detail — bottom sheet (not a route, not a modal)

Click Enter on a card = **play directly**. To see synopsis/metadata first, user goes via `⋯` → "More info".

```
┌──────────────────────────────────────────────────────────────────┐
│   (grid dimmed 40%, locked)                                      │
├──────────────────────────────────────────────────────────────────┤
│  ┌────┐   Thalaivar: The Return                   [X close]     │
│  │    │   2024 · 2h 18m · ⭐ 4.3 · Telugu · Action              │
│  │ █  │                                                          │
│  │    │   After a decade away, a retired commander is pulled     │
│  └────┘   into one last mission when his family is threatened.   │
│                                                                  │
│   [ ▶ PLAY ]   [ ☆ Favorite ]   [ ✓ Mark watched ]               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

- Slides up to ~60% viewport from bottom. Glass blur (§00-ia §6.8).
- Focus auto-lands on `▶ PLAY`.
- D-pad:
  - `Enter` on PLAY → close sheet, open Player
  - `Right` → Favorite → Mark watched → (no-op at end)
  - `Down` / `Up` → no-op (single row of actions)
  - `Back` → close sheet, focus returns to originating card
- Close `X` in top-right is focusable via `Up` from PLAY row.

**No "Similar" row.** Backend has no similar-items endpoint. Deferred.

**Why bottom sheet over route:**
- Route change loses scroll position on Back
- Modal trap is painful on D-pad at 10-foot
- Sheet is a sibling focus region, Back has one clear meaning (close sheet)

---

## 8. Empty / loading / error states

### 8.1 Loading skeleton

Same grid geometry, gray pulsing rectangles. Toolbar renders immediately with last-known count. Focus does **not** auto-advance until the first real card mounts.

### 8.2 Empty state — language genuinely has no movies

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                         📺                                       │
│                                                                  │
│            No Telugu movies in this catalog.                     │
│                                                                  │
│      The provider hasn't categorized any movies as Telugu.       │
│                                                                  │
│       [  Try Hindi  ]   [  Try English  ]   [  Show All  ]       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

- Three buttons = switch to another language, not "loosen" (we have no facets).
- Default focus on "Try Hindi" (second most common user language).
- Copy is honest about provider vs app.

### 8.3 Error state

`ErrorShell` primitive, same as other routes:

```
┌──────────────────────────────────────────────────────────────────┐
│                          ⚠                                       │
│                                                                  │
│                Couldn't load movies.                             │
│                Check your connection.                            │
│                                                                  │
│                [ Retry ]  [ Back to Live ]                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. Playback-failure (tier-locked or stream failure)

Spec'd in `05-player.md §9.3`. Movies route just needs to handle the "Back to browse" path — player closes, focus restores to originating card, and if we learned the card is tier-locked via the failed playback, the card now renders with the `🔒` badge on next focus (cache the finding in `sv_tierlock_cache` session storage).

---

## 10. Click / keypress budgets

| Task | Target | Path |
|---|---|---|
| Cold mount → play first Telugu movie | **2** | Grid focus seeded row 0 col 0 → Enter = play |
| Switch to Hindi → play first | **4** | ArrowUp → ArrowUp (to rail) → ArrowRight (Hindi) → Enter → ArrowDown twice to grid — wait, redo |
| Switch to Hindi → play first | **4** | ArrowUp (to toolbar) → ArrowUp (to rail) → ArrowRight (Hindi chip) → Enter commits + focus returns to grid → Enter on first = **4** after the commit |
| Favorite a focused movie | **3** | Right → Enter → Enter |
| Open More Info | **3** | Right → Enter → Down Down to "More info" → Enter = 4. **Accepted: it's a secondary path.** |
| Resume last-watched (if `⏮ Continue` chip present) | **2** | ArrowUp → ArrowUp → ArrowLeft to chip → Enter. Actually 4. Rework when CW chip's real latency is clear. |

---

## 11. Data contract

### 11.1 Endpoints used (already exist)

```
GET /api/vod/categories                     → CatalogCategory[]
GET /api/vod/streams/:categoryId            → CatalogItem[]  (inferredLang present)
GET /api/vod/info/:vodId                    → CatalogItemDetail (for bottom sheet)
GET /api/history                            → HistoryItem[]  (for progress + CW chip)
GET /api/favorites                          → FavoriteItem[]
POST /api/favorites                         → mutate
DELETE /api/favorites/:id                   → mutate
POST /api/history                           → mutate
```

### 11.2 New frontend client code

- `src/features/movies/languageUnion.ts` — orchestrates §3 fetch plan with per-language cache
- `src/features/movies/MoviesGrid.tsx` — VirtuosoGrid wrapper
- `src/features/movies/MovieCard.tsx` — all card states incl. `⋯` button
- `src/features/movies/MovieDetailSheet.tsx` — bottom sheet

### 11.3 Not needed from backend (contrary to prior spec)

- ❌ `/api/vod/search` — drawer deferred
- ❌ `/api/vod/facet-counts` — drawer deferred
- ❌ `/api/trending` — trending rail deferred

---

## 12. Persistence

| Key | Value | Lifetime |
|---|---|---|
| `sv_lang_pref` | `telugu` \| `hindi` \| `english` \| `all` | forever, cleared on logout |
| `sv_sort_movies` | `added` \| `name` | forever |
| `sv_tierlock_cache` (session) | `{ [vodId]: true }` | per-tab |

---

## 13. Accessibility

- Each poster: `aria-label="<Title>, <Year>"`. When in-progress: append `"resume at <mm:ss>"`.
- Grid: `role="grid"`; rows `role="row"`; cells `role="gridcell"`.
- `⋯` button: `aria-label="More actions for <Title>"`.
- Bottom sheet: `role="dialog" aria-modal="true" aria-labelledby="sheet-title"`.
- Empty-state buttons: focus seeded on "Try Hindi".
- All animations respect `prefers-reduced-motion`.

---

## 14. Decision log

| # | Decision | Alternative rejected |
|---|---|---|
| 1 | Delete CategoryStrip | Keep and filter by lang (impossible states like "Telugu + English FHD 2025") |
| 2 | 4 chips (Telugu/Hindi/English/All) — no Sports | Sports chip (Xtream VOD has almost no Sports; dead affordance) |
| 3 | VirtuosoGrid mandatory | Infinite scroll unvirtualized (DOM OOM at 61k) |
| 4 | Card Enter = play (PR #45 stays) | Card Enter = detail (Netflix/Prime muscle memory wins) |
| 5 | Visible `⋯` overflow menu | Long-press OK (not a norigin primitive) |
| 6 | Bottom sheet for detail, not route | Route (loses scroll) / modal (D-pad trap) |
| 7 | Defer Year/Genre/Rating drawer until backend | Build fake client-side filters (misleading at 61k) |
| 8 | Honest empty state ("No Telugu movies") with language-switch buttons | "Loosen filters" (we have no facet counts) |
| 9 | Sort options trimmed to Added + Name | Year / Rating sort (fields are on detail, not list; per-card fetch is too expensive) |
| 10 | Client-side language union over parallel category fetches | Ask backend for `/api/vod/search` first (blocks this work for weeks) |

---

**End of spec.**
