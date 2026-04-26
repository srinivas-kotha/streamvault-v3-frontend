# 02 — Series UX

**Owner:** UX Lead
**Status:** Revised 2026-04-22 against backend reality (supersedes prior Series spec)
**Scope:** `/series` list + `/series/:id` detail (season picker + episode list). Episode playback is delegated to `05-player.md`.
**Parent:** `00-ia-navigation.md`

---

## 0. Reality anchor

| Available | Missing |
|---|---|
| `GET /api/series/categories` — each with `inferredLang` | No genre facet / year filter endpoint |
| `GET /api/series/list/:catId` — series cards, with `inferredLang`, `genre`, `year` | No cross-category union server-side (client does it) |
| `GET /api/series/info/:seriesId` — **complete**: plot, backdropUrl, seasons[], episodes keyed by season number | — |
| `GET /api/history` (includes series episodes) | No `sv_watch_history.series_id` column — resume-by-series requires client-side derivation or a migration (issue #53) |
| `GET /api/favorites` (series supported) | — |

**Design consequence:** Series detail is **fully frontend-buildable today** — the backend already delivers seasons + episodes in one call. List page uses the same language-union pattern as Movies.

---

## 1. TL;DR — Decisions

1. **Series P0 is frontend-only.** Backend already delivers everything.
2. **4 language chips** on `/series`: Telugu · Hindi · English · All. No Sports (per IA §4.1).
3. **Card Enter = navigate**, not play. `/series/:id` (critical — fixes the "series buffers forever" bug).
4. **Detail page: resume-first CTA.** `Continue S_E_ mm:ss/mm:ss` when history exists; `Play S1E1` on first visit; `Rewatch S1E1` when all watched. Auto-focused → **1 Enter = playing**.
5. **Seasons = horizontal chip rail.** D-pad-native, no dropdowns.
6. **Episodes = vertical rows** with still-image, title, progress/watched glyph, visible `⋯` overflow.
7. **Tier-locked episodes badged `🔒`** when `canPlay === false` (requires per-episode containerExtension + account.allowedFormats check — backend already supplies the fields).
8. **Issue #53 (sv_watch_history.series_id)** is a P1 migration to avoid brittle client-side derivation of per-series resume state. Plan in `99-grill-findings`.

---

## 2. `/series` list layout

```
┌──────────────────────────────────────────────────────────────────┐
│  SERIES                                                          │
│                                                                  │
│  [⏮ Continue] [Telugu*] [Hindi] [English] [All]                  │  ← LanguageRail (4)
│                                                                  │
│  Sort: [Added*] [Name]                        487 series         │  ← Toolbar
│                                                                  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │
│  │ █  │ │ █  │ │ █  │ │ █  │ │ █  │ │ █  │                       │
│  │NEW │ │▰▰▱│ │    │ │    │ │    │ │NEW │                       │
│  │S1E8│ │S2E3│ │    │ │    │ │    │ │S4E1│                       │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                       │
│  Title  Title  Title  Title  Title  Title                        │
│                                                                  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │
│  │ █  │ │ █  │ │ █  │ │ █  │ │ █  │ │ █  │                       │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Same structure as Movies (`03-movies.md §2`). Differences:

- 4 language chips (no Sports)
- Grid not virtualized by default — series count per language is typically <500. Virtualize only if we hit 2k+ on "All".
- Card Enter navigates to detail, not plays

### 2.0 FIND chip — in-route substring filter

Identical contract to Movies (`03-movies.md §5.1`): a `🔍 FIND` pill in the toolbar that expands into a client-side substring filter over the already-loaded series union. Zero network. Runs `filterByQuery(seriesList, query, (s) => s.name)`. Empty state escalates to `/search?q=<findQuery>` — the dock Search tab (`04-search-and-language-rail.md`) is the only way to cross into Movies / Live from here.

**Find vs Search (mental model).** FIND narrows this screen. Search crosses libraries. Both exist intentionally — removing either breaks a real flow. See `03-movies.md §5.1` for the full rationale.

### 2.1 Card states

Badges on focused OR idle cards (not hover-only):

- `NEW` pill top-right — `max(episode.added) > user.last_seen_series_at` (14 days)
- `S_E_` bottom-right — last-watched episode shorthand (if history exists for this series)
- Progress bar bottom edge — when in-progress
- `🔒` top-right — if ANY episode is tier-locked (best-effort; needs detail fetch)

### 2.2 Focused-card overflow menu

Same `⋯` pattern as Movies cards. Menu items for series:

```
┌──────────────────────────────┐
│  ☆  Add to favorites         │
│  ⓘ  More info                │
│  ✓  Mark series as watched   │
└──────────────────────────────┘
```

"More info" opens a bottom sheet at the list level (not the detail route) — a preview with backdrop + synopsis + season count. Pressing "Open series" on the sheet navigates to `/series/:id`. This is a shortcut for "do I want to commit to 5 seasons?" without losing grid scroll position.

"Mark series as watched" writes history for every episode via bulk calls. Asks for confirmation first.

---

## 3. `/series/:id` detail layout

### 3.1 First-visit state (no progress)

```
┌──────────────────────────────────────────────────────────────────┐
│ ░░░ backdropUrl (dimmed 50%) ░░░                                 │
│                                                                  │
│  ┌──────┐   Thalaivar Reborn                 ★ 4.2 · 2023 · Drama│
│  │      │   ──────────────────────────────────────────────────── │
│  │poster│   Synopsis text up to 3 lines with ellipsis…           │
│  │      │                                                        │
│  │      │   ╔════════════════╗  [ ♥ ]  [ ✓ Mark all watched ▾ ]  │
│  │      │   ║ ▶  Play S1E1   ║                                   │
│  └──────┘   ╚════════════════╝  ↑ auto-focused on mount          │
│                                                                  │
│  Seasons  [Season 1*] [Season 2] [Season 3] [Season 4] [Specials] │
│                                                                  │
│  Episodes — Season 1                                             │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ┌──────┐  1 · Pilot                     45:12  · 2023   ○ │  │
│  │ │ still│  Brief synopsis…                              ⋯  │  │
│  │ └──────┘                                                  │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ ┌──────┐  2 · Second                     44:03  · 2023  ○ │  │
│  │ │ still│  Brief synopsis…                              ⋯  │  │
│  │ └──────┘                                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Mid-watch state (progress exists)

```
  ╔══════════════════════════════════════╗  [ ♥ ]  [ ✓ Mark all ▾ ]
  ║ ▶  Continue S2E5  18:42 / 44:12      ║
  ╚══════════════════════════════════════╝
   progress: ▰▰▰▰▰▰▱▱▱▱▱▱  42%

  Seasons  [Season 1 ✓] [Season 2*] [Season 3] …
                           ↑ seeded to in-progress season

  Episodes — Season 2
  ┌────────────────────────────────────────────────────────────┐
  │ ┌──────┐  4 · Title                     44:00  · ✓         │ watched
  ├─┤      ┼  5 · Title                     ▰▰▰▱▱ 18:42  · ●   │ ← focus-seeded
  │ └──────┘    Brief synopsis…                           ⋯   │
  │ ┌──────┐  6 · Title                     44:12  · ○         │
  └────────────────────────────────────────────────────────────┘
```

### 3.3 All-watched state

```
  ╔══════════════════════════════════════╗
  ║ ▶  Rewatch S1E1                      ║  [ ♥ ]  [ Mark unwatched ▾ ]
  ╚══════════════════════════════════════╝

  Seasons  [Season 1 ✓] [Season 2 ✓] [Season 3 ✓]
```

### 3.4 Tier-locked state (provider limitation)

If ANY episode is tier-locked:

```
Under the hero: non-dismissable banner:
  ⓘ  Some episodes on this series require an upgraded provider plan.
```

Locked episode rows render with `🔒` glyph and `canPlay: false`. Hero "Play S1E1" automatically skips locked episodes when picking the default (plays first playable episode). "Continue" logic is untouched since the user already chose that episode.

---

## 4. D-pad focus flow (detail)

| From | ArrowUp | ArrowDown | ArrowLeft | ArrowRight |
|---|---|---|---|---|
| Hero CTA (auto-focus) | dock | Season tabs | — (no-op) | ♥ Favorite |
| ♥ Favorite | dock | Season tabs | Hero CTA | Mark all ▾ |
| Mark all ▾ | dock | Season tabs | ♥ | — |
| Season tab (active) | Hero CTA | First episode row | Prev season | Next season |
| Episode row | Prev row (or Season tabs if row 1) | Next row | — | `⋯` overflow |
| `⋯` overflow | Prev row's `⋯` | Next row's `⋯` | Episode row | — |
| Sort dropdown (if rendered) | Hero CTA | First episode | Episode row | — |

### 4.1 Auto-focus on mount

- First visit / all-watched / resume-first all seed Hero CTA (see §3.1-3.3).
- This is the **single most important affordance** of this page — 1 Enter must play.

### 4.2 Back

Back → `router.back()` to `/series` grid. Focus restores to the originating series card via ref-bookmark pattern.

---

## 5. Episode row — anatomy

```
┌──────────────────────────────────────────────────────────────────┐
│  ┌──────┐                                                        │
│  │      │  3 · Episode Title              44:12  · 2023   ○     │
│  │still │  One-line synopsis that truncates with…               │
│  │160×90│                                                   ⋯   │
│  └──────┘                                                        │
└──────────────────────────────────────────────────────────────────┘
```

State glyphs (right-aligned):
- `○` unseen (hollow ring)
- `▰▰▰▱▱ mm:ss` in-progress (progress + timestamp)
- `✓` watched (copper fill)
- `🔒` tier-locked (non-focusable — Enter opens the playback-failure overlay with tier-locked copy)

### 5.1 Overflow menu on episode rows

```
┌──────────────────────────────┐
│  ✓  Mark as watched          │
│  ○  Remove from history      │
└──────────────────────────────┘
```

Actions map to `recordHistory(episodeId, progress=duration)` and client-side history removal (backend DELETE /api/history in follow-up).

---

## 6. Data retrieval

### 6.1 List page — same union as Movies

See `03-movies.md §3`. Four-language-union. Cache 5min. No pagination.

### 6.2 Detail page — single call

```
GET /api/series/info/:seriesId
  → {
      id, name, plot, backdropUrl, rating, year, genre,
      seasons: [{ seasonNumber, name, episodeCount, icon? }],
      episodes: {
        1: [{ id, episodeNumber, title, plot, duration, icon, added, containerExtension }],
        2: [...],
        ...
      }
    }
```

Backend already delivers this ([xtream.adapters.ts:89-137](../../streamvault-backend/src/providers/xtream/xtream.adapters.ts#L89)). Frontend only job: render it.

Frontend tolerates empty `seasons[]` from upstream by deriving the season list from `episodes` keys (union with any provided `seasons[]` for name/icon enrichment).

### 6.3 Resume derivation

Until `sv_watch_history.series_id` exists (issue #53):

```
1. Fetch /api/history
2. Filter `content_type === 'series'` items
3. For each, infer series id from `content_name` convention "SeriesName · S2E5 · Title" — brittle
4. Return {seriesId: {lastEpisodeId, progressSeconds, durationSeconds, watchedAt}}
```

**This is the brittle part.** The #53 migration adds `series_id` column and changes `recordHistory` to write it alongside `content_id` for series episodes. Once shipped, derivation becomes:

```
SELECT series_id, MAX(watched_at) FROM sv_watch_history
  WHERE content_type = 'series'
  GROUP BY series_id;
```

The spec here assumes the brittle client-side path works for MVP and #53 lands in a follow-up PR.

---

## 7. Hero CTA logic — complete

```
On /series/:id mount:
  history = historyForSeries(seriesId)

  if history.hasAnyProgress:
    lastEp = history.mostRecentEpisode
    if lastEp.progress / lastEp.duration > 0.90:
      # treat as watched; show next
      nextEp = episodesAfter(lastEp)[0]
      if nextEp: hero = "Play S{n}E{m}"  (nextEp)
      else:      hero = "Rewatch S1E1"    (all done)
    else:
      # mid-watch
      hero = "Continue S{n}E{m} mm:ss/mm:ss"
  else:
    # first visit
    firstPlayable = episodes[1].find(ep => ep.canPlay)
    hero = firstPlayable ? "Play S{firstPlayable}E{1}" : "Play S1E1"
```

All three branches end with a **single-button hero, auto-focused**. Enter plays.

---

## 8. Empty / error / edge states

### 8.1 List empty state

Identical to Movies (§03 §8.2) — honest message + language-switch buttons.

### 8.2 Detail: empty season

```
┌──────────────────────────────────────┐
│                                      │
│   No episodes in Season 3 yet.       │
│                                      │
│   [ Try another season ]             │
│                                      │
└──────────────────────────────────────┘
```

### 8.3 Detail: load error

`ErrorShell` with Retry. Retry preserves `seriesId`. "Back to series" navigates to `/series` (not browser back; prevents leaving the app).

### 8.4 "Specials" seasons

Xtream sometimes returns `season_number: 0`. Render as `"Specials"` chip, sorted to the end of the Seasons rail.

---

## 9. Click / keypress budgets

| Task | Target | Path |
|---|---|---|
| Cold `/series/:id` → continue playing | **1** | Enter (hero auto-focused on Continue) |
| Cold series (no history) → play S1E1 | **1** | Enter (hero defaults to Play S1E1) |
| Pick S3E7 | **3-5** | Down (seasons) → Right×2 (S3) → Down (ep list) → Down×6 → Enter. Typical close-to-top episode: 3. |
| Favorite from hero | **2** | Right → Enter |
| Mark an episode watched via `⋯` | **3** | Right (to ⋯) → Enter → Enter |
| Series list → detail → play | **2-3** | Enter on card → (page loads, hero primed) → Enter |

---

## 10. Persistence

| Key | Value | Lifetime |
|---|---|---|
| `sv_lang_pref` | global | forever |
| `sv_sort_series` | `added` \| `name` | forever |
| `sv_series_last_season:{seriesId}` | season number | per-series |

---

## 11. Accessibility

- Every card has `aria-label="<Title>, <Year>, <N> seasons"`
- Hero CTA: `aria-label="Continue Season 2 Episode 5 from 18 minutes 42 seconds"` when Continue
- Season chips: `role="tab"`, active tab `aria-selected="true"`
- Episode rows: `role="button"` with full descriptive label
- Banner about tier-lock: `role="status" aria-live="polite"`

---

## 12. Decision log

| # | Decision | Alternative rejected |
|---|---|---|
| 1 | Card Enter = navigate to detail (not play) | Play directly (series-id is not a stream; P0 bug) |
| 2 | 4 chips (no Sports) on /series | Match Live (5 chips; Sports on Series is virtually empty) |
| 3 | Detail fetched via single `/api/series/info/:id` call | Separate seasons/episodes endpoints (already unified; would regress) |
| 4 | Resume-first hero CTA, auto-focused | Season picker first (costs 1 Enter for the common case) |
| 5 | Seasons as horizontal chips | Dropdown (hides options; D-pad unfriendly) |
| 6 | Episodes as vertical rows | Grid (synopsis + still + progress don't fit in posters) |
| 7 | Visible `⋯` on every row | Long-press OK (not a norigin primitive) |
| 8 | Tier-lock precheck banner under hero | Silent per-episode marks only (users don't notice until they hit the overlay) |
| 9 | #53 (`sv_watch_history.series_id`) deferred to P1 | Block on it (brittle derivation works for MVP) |
| 10 | List grid not virtualized until 2k series | Always virtualize (adds complexity at sub-2k scales) |

---

**End of spec.**
