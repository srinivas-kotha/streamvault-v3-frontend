# 02 — Series UX Design (P0 fix)

**Author:** Series UX
**Date:** 2026-04-22
**Scope:** `/series` list page + `/series/:id` detail & episode picker
**Status:** Design-only. No code changes in this doc.

---

## TL;DR — Decisions

1. **New route** `/series/:id`. Clicking a series card navigates; does **not** call `openPlayer` with a series-id (the current P0 bug).
2. **Resume-first CTA.** If watch history exists, the hero's primary button is `Continue S_E_`. Otherwise `Play S1E1`. Auto-focused on page arrival → **1 Enter = watching**.
3. **Language rail** on `/series` defaults to **Telugu**, persisted under `localStorage.sv_series_lang` (same pattern as planned `sv_live_lang`).
4. **Default sort** = *Latest episode added*. Secondary: Alphabetical, Recently added, My progress, Most watched (if available).
5. **Seasons = horizontal chip rail**, not a dropdown. D-pad-native (no modal layer), one-ArrowDown to episodes.
6. **Episode list = vertical rows**, not a grid. Wider thumbs, synopsis visible, D-pad Up/Down is obvious.
7. **Unsupported-format error** is shown **before** the player opens (precheck via a HEAD or a stream-probe endpoint), with a clear "This episode isn't available on your subscription tier" message + fallback CTAs.
8. **Search → Series must navigate** to `/series/:id`, never `openPlayer`. Callout in §5.

### Click-budget table

| Task | Current clicks | Designed clicks | Delta |
|---|---|---|---|
| Cold click series card → player (buffers forever) | 1 (broken) | n/a | fix |
| Cold click series card → **latest unwatched** episode playing | ∞ (broken) | **1** (hero auto-focus, Enter) | -∞ |
| Mid-watch: click series card → resume exact episode at timestamp | ∞ (broken) | **1** (Continue CTA auto-focus) | -∞ |
| Pick an arbitrary S_E_ from list | ∞ (broken) | **3** (Down to season, Right to season N, Down to episode, Enter) | -∞ |
| Favorite a series from detail | n/a | **2** (Right from hero CTA to ♥, Enter) | new |
| Mark episode watched from list | n/a | **2** (Enter-hold on episode → sheet → Enter on "Mark watched") | new |
| Play first-ever episode (first-visit series) | ∞ (broken) | **1** (hero defaults to Play S1E1) | -∞ |

---

## 1. `/series` List Page Redesign

### Layout (1920×1080 Fire TV + desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ░░░░░░ ambient copper glow ░░░░░░                                        │
│                                                                          │
│  SERIES                                                                  │
│                                                                          │
│  ┌─ Language ───────────────────────────────────────┐                    │
│  │ [Telugu*] [Hindi] [English] [Tamil] [Malayalam]  │  ← row 1 toolbar   │
│  │ [Kids] [All]                                     │                    │
│  └──────────────────────────────────────────────────┘                    │
│                                                                          │
│  ┌─ Genre ─────────────┐  ┌─ Sort ─────────────────────────────┐         │
│  │ [All*] [Drama] [...] │  │ [Latest episode ▾]                │         │
│  └──────────────────────┘  └────────────────────────────────────┘        │
│                                                                          │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                         │
│  │ P1  │ │ P2  │ │ P3  │ │ P4  │ │ P5  │ │ P6  │   ← poster row 1       │
│  │ NEW │ │ ▰▱▱ │ │     │ │ 🔒  │ │     │ │ NEW │                         │
│  │S1E8 │ │S2E3 │ │     │ │     │ │     │ │S4E1 │                         │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                         │
│   Title   Title   Title   Title   Title   Title                          │
│   తెలుగు   తెలుగు  हिन्दी    EN      EN      తెలుగు                      │
│                                                                          │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   ← poster row 2       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why.** Mirrors `LiveRoute` (language rail top, toolbar, list below). Reusing the pattern means zero new D-pad logic for users and zero new focus-registration bugs for us.

### Toolbar decisions

- **Language rail:** reuse `LanguageButton` primitive from `LiveRoute.tsx`. Default **Telugu** (user priority). Persist to `localStorage.sv_series_lang`.
- **Genre chips:** secondary toolbar row. Populated from backend `/api/series/categories` parent-grouped by inferred genre tag. Default `All`.
- **Sort dropdown** (not a chip row — too many options to eat vertical space):
  - **Latest episode added** (default) — requires new `episodes.max(added_at)` sort key. See §6.
  - **Alphabetical** (A–Z)
  - **Recently added to catalog** — existing `added` field
  - **My progress** (resume-first) — series with `history.progress_seconds > 0` and `< duration` sorted by `watched_at desc`. Finished series drop to the bottom.
  - **Most watched** — if `history.play_count` exists; hide this option when unavailable rather than showing it greyed.

### Card states — wireframes

```
DEFAULT                FOCUSED (copper ring)    WITH PROGRESS            NEW EPISODE
┌─────────────┐        ╔═════════════╗          ┌─────────────┐          ┌─────────────┐
│             │        ║             ║          │             │          │         NEW │
│   poster    │        ║   poster    ║          │   poster    │          │   poster    │
│             │        ║             ║          │             │          │             │
│             │        ║             ║          │             │          │             │
│             │        ║             ║          │▰▰▰▰▰▱▱▱▱▱▱ │          │       S4E1  │
└─────────────┘        ╚═════════════╝          │    S2E3     │          └─────────────┘
Title (1 line)         Title (1 line)           └─────────────┘          Title (1 line)
తెలుగు                  తెలుగు                     Title (1 line)          తెలుగు
                                                తెలుగు
```

Badge anchors:
- `NEW` pill (copper bg, bg-base text) — top-right, 8px inset. Shown when `max(episode.added_at) > user.last_seen_series_at`.
- Progress pill `S_E_` + progress bar — bottom of poster. Shown when history has non-zero progress on any episode.
- Language chip — below title, muted text. Read from inferred language (same rules as `LiveRoute` `LANGUAGE_PATTERNS`, extended for `tamil`/`malayalam`).
- Lock icon (center) — tier-locked series (see §4).

### D-pad flow for `/series` list

- **Arrival** (from dock): focus lands on first active language chip (Telugu).
- **Up/Down from language rail:** Down goes to genre chips; Up from language rail goes to dock (existing CONTENT_AREA escape).
- **Genre row ↔ sort dropdown:** same row, Left/Right walks both.
- **Down from genre/sort:** enters first poster (row 1, col 1).
- **Within grid:** norigin 2D nav (already works on Movies).
- **Enter on poster:** navigates to `/series/:id` — does **not** call openPlayer.

**Click count: language pick (1) → genre pick (1) → scroll to series (0) → Enter (1) = arrive at detail in 3 inputs when filtering.** Most users accept the default Telugu/All filters and it's **1 scroll + 1 Enter = 2**.

---

## 2. `/series/:id` Detail Page (the P0 fix)

### Layout — first-visit state (no progress)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ░░░ backdrop image (darkened, 40% opacity) ░░░                           │
│                                                                          │
│  ┌─────────┐  HERO                                                       │
│  │         │  Series Title                          ★ 4.2 · 2023 · Drama│
│  │ poster  │  ──────────────────────────────────────────────────────    │
│  │         │  Synopsis copy for 2–3 lines, ellipsis after. The full     │
│  │         │  text is available on an "… more" reveal; see D-pad.       │
│  │         │                                                            │
│  │         │  ╔════════════════╗  [  ♥  ]  [ + List ]  [ ✓ Mark all   ] │
│  │         │  ║ ▶  Play S1E1   ║                        [watched ▾    ] │
│  └─────────┘  ╚════════════════╝  ↑ auto-focused on arrival             │
│                                                                          │
│  ┌─ Seasons ────────────────────────────────────────────────────────┐    │
│  │  [Season 1*]  [Season 2]  [Season 3]  [Season 4]  [Specials]    │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Episodes — Season 1                                 [Sort: Natural ▾]  │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │ ┌──────┐  1 · Pilot                              45:12   2023 │      │
│  │ │ still│  Brief synopsis, one line ellipsis…            ○    │      │
│  │ └──────┘                                                      │      │
│  ├────────────────────────────────────────────────────────────────┤      │
│  │ ┌──────┐  2 · Second Episode                     44:03   2023 │      │
│  │ │ still│  Brief synopsis…                                ○    │      │
│  │ └──────┘                                                      │      │
│  ├────────────────────────────────────────────────────────────────┤      │
│  │ ┌──────┐  3 · Third Episode                      43:58   2023 │      │
│  │ │ still│  Brief synopsis…                                ○    │      │
│  │ └──────┘                                                      │      │
│  └────────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Layout — mid-watch state (user has progress on S2E5)

```
  ╔═════════════════════════════╗  [ ♥ ]  [ + List ]  [ ✓ Mark all ]
  ║ ▶  Continue S2E5  18:42/44:12║                       watched ▾
  ╚═════════════════════════════╝                    [ Play S1E1 ▾ ]
                                                     (secondary, Tab-hidden)
    progress bar under CTA: ▰▰▰▰▰▰▱▱▱▱▱  42%

  Seasons    [Season 1 ✓]  [Season 2*]  [Season 3]  …
                                  ↑ seeded to in-progress season

  Episodes — Season 2                                [Sort: Natural ▾]
  ┌────────────────────────────────────────────────────────────────┐
  │ ┌──────┐  4 · Title                              44:00   ✓    │  watched
  │ ├──────┤  5 · Title                              ▰▰▰▱▱ 18:42  │  in-prog
  │ │      │  Brief synopsis…                              ●      │  focus-seed
  │ └──────┘                                                      │
  │ ┌──────┐  6 · Title                              44:12   ○    │  unseen
  └────────────────────────────────────────────────────────────────┘
```

### Layout — all-watched state

```
  ╔═════════════════════════════╗
  ║ ▶  Rewatch S1E1             ║   [ ♥ ]  [ + List ]  [ Mark unwatched ▾ ]
  ╚═════════════════════════════╝

  Seasons  [Season 1 ✓]  [Season 2 ✓]  [Season 3 ✓]   ← all ticked

  Episodes — Season 1    All watched. [Sort: Newest first ▾]
  ┌────────────────────────────────────────────────────────────────┐
  │ ┌──────┐  1 · Pilot                               45:12   ✓   │
  │ ├──────┤  2 · …                                    44:03   ✓   │
  └────────────────────────────────────────────────────────────────┘
```

### D-pad map

| Surface | On-arrival focus | Up | Down | Left | Right |
|---|---|---|---|---|---|
| Hero primary CTA (Play/Continue) | **yes — seeded here** | → dock | Season tabs | (no-op or Mark-all) | ♥ Favorite |
| ♥ Favorite | — | → dock | Season tabs | Primary CTA | + List |
| + List | — | → dock | Season tabs | ♥ | Mark watched ▾ |
| Mark watched ▾ | — | → dock | Season tabs | + List | (no-op) |
| Season tab (active) | — | Hero CTA | First episode row | Prev season | Next season |
| Episode row | — | Prev row / Season tabs (if row 1) | Next row | (no-op or actions) | Sort dropdown |
| Sort dropdown | — | Hero CTA | First episode row | Episode row | (no-op) |

**Why horizontal season chips instead of a dropdown:**
- Dropdowns require an extra Enter to open, then D-pad navigate inside the popover — that's 2 inputs just to see options. Chips expose all seasons immediately.
- Norigin spatial-nav handles chip rails perfectly already (`LanguageButton`, `SortButton` patterns exist).
- Chips also give us cheap room for a per-season "✓ watched" tick.
- Dropdown fallback: if a series has **>8 seasons** (rare; daytime TV), collapse into a dropdown. Edge case only.

### Click budget for `/series/:id`

- **Arrival → resume episode playing:** `1` (hero auto-focused + Enter) ✅ meets priority.
- **Arrival → play S1E1 on a fresh series:** `1` (hero defaults to Play S1E1 + Enter) ✅.
- **Arrival → pick S3E7:** `Down` (to Season tabs) + `Right Right` (to S3) + `Down` (to S3 episode 1) + `Down Down Down Down Down Down` (to S3E7) + `Enter` = 11 for the long-tail worst case; **typical** S_E_ pick near the top of a season is **3** (Down to season tab, Down to episode list, Enter). Well under the ≤3 target.
- **Arrival → switch to newest-first sort:** `Right Right Right` (through hero row actions) + `Down` (to sort) + `Enter` + `Down` (to Newest) + `Enter` = 6. Accepted for secondary action.

### Episode row — anatomy

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌──────────┐                                                        │
│ │          │  3 · Episode Title                     44:12 · 2023   │
│ │  still   │  One-line synopsis that truncates with…                │
│ │ 160×90px │                                               ● state  │
│ └──────────┘                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

- `still` = `episode.still_url` (requires backend — §6). Fallback: blurred series poster crop.
- State glyph, right-aligned:
  - `○` unseen (bg-surface ring)
  - `▰▰▰▱▱` in-progress (progress bar replaces circle; shows `mm:ss` watched)
  - `✓` watched (copper fill)
  - `🔒` tier-locked (see §4)
- Focused row: 2px copper ring + 4% lift on bg (reuse `--motion-focus`).

---

## 3. Episode Card Interaction States

### Idle / Focused / Watched / In-progress / New / Locked

```
IDLE                                   FOCUSED
┌──────────────────────────────────┐   ╔══════════════════════════════════╗
│ ┌──┐ 3 · Title      44:12   ○    │   ║ ┌──┐ 3 · Title     44:12   ○    ║
│ │  │ Synopsis…                   │   ║ │  │ Synopsis…                  ║
│ └──┘                             │   ║ └──┘                            ║
└──────────────────────────────────┘   ╚══════════════════════════════════╝

WATCHED (muted title, ✓ glyph)         IN-PROGRESS (progress bar, timestamp)
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ ┌──┐ 3 · Title      44:12   ✓    │   │ ┌──┐ 3 · Title  ▰▰▰▱▱ 18:42      │
│ │✓ │ Synopsis (dimmed)…          │   │ │⏵ │ Synopsis…                   │
│ └──┘                             │   │ └──┘                             │
└──────────────────────────────────┘   └──────────────────────────────────┘

NEW EPISODE (copper NEW pill)          LOCKED (tier-locked; §4)
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ ┌──┐ 12 · Title     44:12  ●NEW  │   │ ┌──┐ 3 · Title      44:12  🔒    │
│ │• │ Added 2 days ago…           │   │ │🔒│ Not available on your tier  │
│ └──┘                             │   │ └──┘                             │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

### OK-hold / long-press actions sheet

Press-and-hold Enter / remote OK for 500ms on a focused episode row → bottom sheet slides in:

```
┌──────────────────────────────────────────────────────────────┐
│  Episode 3 · Title                                           │
│                                                              │
│  ▶  Play from start                                          │
│  ⏵  Resume at 18:42                (only if progress exists) │
│  ✓  Mark watched                                             │
│  ○  Mark unwatched                                           │
│  ⏭  Play next                                                │
│  ✕  Cancel                        (Back closes)              │
└──────────────────────────────────────────────────────────────┘
```

D-pad in sheet: Up/Down walks rows. Enter selects. Back closes. Focus returns to the episode row it was opened from (norigin `setFocus(lastFocusedKey)`).

**Click count for Mark watched: Enter-hold + Down Down + Enter = ~3** keys (hold counts as one input for the user's mental model).

---

## 4. Provider Limitations — Unsupported Format

**Problem.** The Xtream account's `allowed_output_formats: ["ts"]` means many VOD/series episodes whose upstream container is `mp4`/`mkv` return 0 bytes. Current UI buffers forever or shows a cryptic "Playback error".

**Design.** Fail **fast** and **honestly**.

### Prevention tier (preferred)

Backend adds a `canPlay: boolean` field per episode in the detail response based on `episode.container_extension` vs. `provider.account.allowedFormats`. When `false`:
- Episode row renders with `🔒` glyph and a muted title.
- Hero "Play S1E1" CTA skips locked episodes when picking default (so Play defaults to the first **playable** episode — Continue logic untouched since that's already user-chosen).
- Sort "Newest first" still shows locked episodes; they're just visually distinct.

### Reaction tier (if backend precheck misses)

If the stream probe/HEAD succeeds at backend but returns 0 bytes mid-play:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                         🔒                                   │
│                                                              │
│       This episode isn't available on your plan              │
│                                                              │
│   Your subscription only allows .ts streams, and this        │
│   episode is delivered as .mp4 by the provider.              │
│                                                              │
│       [ Try next episode ]  [ Back to series ]              │
│                                                              │
│       Tap ♥ if you'd like us to notify you if the            │
│       provider adds support. (future)                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Copy is specific ("your plan", "the provider"), not generic ("Playback error").
- Two actions on same row: Left = try next episode (auto-plays next playable ep in the same season); Right = back to series detail (preserves focus on the episode row you came from).
- D-pad arrival: focus seeds on "Try next episode".
- **Never** auto-dismiss this modal — users learn to spot locked episodes when they see this screen consciously.

### Tag on detail page header

If ANY episode in the currently-viewed series is locked, show a small banner under the hero:

```
ⓘ  Some episodes on this series require an upgraded provider plan.
```

Non-dismissable. No link (we're not the provider). Just honesty.

---

## 5. Search Handoff Callout

**P1 #6 in the 2026-04-22 handoff:** `SearchResultsSection` currently calls `openPlayer({ kind: "series-episode", id: series_id })` for series hits — same bug as the series list route.

### Fix (once this design lands)

- In `SearchResultsSection`, series hit → `navigate('/series/${id}')`, **not** `openPlayer`.
- VOD hits continue to call `openPlayer` (unchanged; VOD plays directly).
- Live hits continue to open a channel (unchanged).

### Visual — series result card in search

```
┌──────────────────────────────────────────────────────────────┐
│  ┌──────┐                                                    │
│  │poster│  Series Name                                       │
│  │      │  3 seasons · Drama · Telugu                        │
│  └──────┘                                                    │
│                                                              │
│          Enter → opens /series/:id                            │
└──────────────────────────────────────────────────────────────┘
```

Focus behaviour on Enter: navigate away, dispose SearchRoute focus, hero CTA on detail page gets auto-focus (same seed behaviour as cold nav).

---

## 6. Data Contract — Backend Asks

Today `GET /api/series/info/:id` hits `provider.getSeriesInfo()` which already returns `CatalogItemDetail` with `seasons: SeasonInfo[]` and `episodes: Record<string, EpisodeInfo[]>`. **The backend fields exist in the type system** — the router wires it through. What we need:

### Required (blocking the P0 implementation)

| Field | Location | Purpose | Xtream source |
|---|---|---|---|
| `seasons[].seasonNumber` | `CatalogItemDetail.seasons` | Build season-chip rail | `get_series_info.seasons[].season_number` |
| `seasons[].name` | same | Season chip label | `seasons[].name` (fallback: `"Season ${n}"`) |
| `seasons[].episodeCount` | same | Chip badge (optional) | `length(episodes[season_number])` |
| `episodes[seasonNum][].id` | `CatalogItemDetail.episodes` | **Streamable ID** — the thing we pass to `openPlayer` | `episodes[season_number][].id` (Xtream episode `id`, **not** series_id) |
| `episodes[].episodeNumber` | same | Row number | `episode_num` |
| `episodes[].title` | same | Row title | `title` |
| `episodes[].duration` (seconds) | same | Row duration | `info.duration_secs` or `info.duration` parsed mm:ss |
| `episodes[].containerExtension` | same | Pass to `getStreamInfo(id, "series", ext)` | `container_extension` |
| `episodes[].plot` | same | Row synopsis line | `info.plot` |
| `episodes[].icon` (still_url) | same | Thumbnail | `info.movie_image` or `info.cover_big` |
| `episodes[].added` (ISO date) | same | Aired-date column + NEW badge | `info.releasedate` or `added` timestamp |

**Backend verified 2026-04-22** (closes #54): `adaptSeriesInfo()` at `streamvault-backend/src/providers/xtream/xtream.adapters.ts:89-135` already maps every field in the table above; `xtream.provider.ts:210-234` wires the route. **No backend changes required for the P0** — frontend can build straight against the existing contract. (Earlier draft asked to "verify" — that verification is now done; if a field looks missing on a real response, treat as a regression and file a backend bug, don't redesign the spec.)

### Nice-to-have (P1)

| Field | Purpose |
|---|---|
| `canPlay: boolean` per episode | Format-tier lock glyph (§4 prevention tier). Server-side check: `allowedFormats.includes(episode.containerExtension ?? "ts")`. |
| `backdropUrl` on `CatalogItemDetail` | Hero backdrop image at the top of `/series/:id`. Xtream `info.backdrop_path[0]`. |
| `cast`, `director`, `tmdbId` | Optional details row. Already in `CatalogItemDetail` type. |
| `seasons[].icon` | Season chip background. Optional. |

### New frontend client additions

In `src/api/series.ts`:

```
fetchSeriesInfo(seriesId: string): Promise<SeriesInfo>
  → GET /api/series/info/:id
  → returns { id, name, plot, backdropUrl, seasons[], episodes{} }
```

In `src/api/schemas.ts` add:

- `SeasonInfoSchema` — `{ seasonNumber, name, episodeCount, icon? }`
- `EpisodeInfoSchema` — `{ id, episodeNumber, title, duration?, containerExtension?, plot?, icon?, added? }`
- `SeriesInfoSchema` — extends `SeriesItemSchema` with `plot?, backdropUrl?, seasons[], episodes[seasonNumber → EpisodeInfo[]]`

### PlayerOpener contract change

Today: `openPlayer({ kind: "series-episode", id: <series_id> })` — broken.

Designed: `openPlayer({ kind: "series-episode", id: <episode_id>, title: "S2E5 · Episode Title", containerExt: "mp4" })` where `id` is **episode.id**, not series.id.

`PlayerProvider`/`useHlsPlayer` engine router already handles `kind: "series-episode"` — it just needs the right ID. No engine changes.

### Resume contract

When entering `/series/:id`:
1. Fetch `GET /api/history?content_type=series&series_id=<id>` (new endpoint or extend existing `fetchHistory()` with a filter).
2. If any episode has `progress_seconds > 0 && progress_seconds < duration_seconds`: seed hero CTA as **Continue S_E_ mm:ss/mm:ss**; seed season tab = that episode's season; seed episode-list focus = that episode.
3. If all episodes fully watched: hero CTA = **Rewatch S1E1**; seed season tab = S1; seed focus = S1E1.
4. Otherwise: hero CTA = **Play S1E1**; seed season tab = S1; seed focus = S1E1.

History write on episode play:
- `PUT /api/history/:episodeId` with `{ content_type: "series", content_id: episode.id, content_name: "SeriesName · S2E5 · Title", progress_seconds, duration_seconds }`.
- **Also record series-level hint** so the series card on `/series` list shows the `S_E_` progress chip without us scanning every episode: either
  (a) new column `sv_history.series_id` (preferred) and query `MAX(watched_at) GROUP BY series_id`, or
  (b) derive on client from `content_name` prefix (brittle — avoid).

This is the one schema change worth pushing for on the backend.

---

## 7. Persistence & Local Storage Keys

| Key | Value | Lifetime |
|---|---|---|
| `sv_series_lang` | `"telugu"` \| `"hindi"` \| `"english"` \| `"tamil"` \| `"malayalam"` \| `"kids"` \| `"all"` | forever; cleared on logout |
| `sv_series_sort` | `"latest_episode"` \| `"alpha"` \| `"recently_added"` \| `"progress"` \| `"most_watched"` | forever |
| `sv_series_genre` | category id or `"all"` | forever |
| `sv_series_ep_sort:${seriesId}` | `"natural"` \| `"newest"` | optional; per-series |

Default on cold install: language=`telugu`, sort=`latest_episode`, genre=`all`, episode sort=`natural`.

Cleared by the same `clearHistoryLocalStorage()` logout pattern (`src/api/history.ts`).

---

## 8. Empty / Error States

```
EMPTY SEASON                              LOAD ERROR
┌────────────────────────────────┐        ┌────────────────────────────────┐
│                                │        │                                │
│    No episodes in this         │        │   Can't load this series       │
│    season yet.                 │        │                                │
│                                │        │   Check your connection.       │
│    [ Try another season ]      │        │   [ Retry ]  [ Back to list ] │
│                                │        │                                │
└────────────────────────────────┘        └────────────────────────────────┘
```

- Reuse `ErrorShell` primitive. Retry preserves `seriesId`.
- `Back to list` navigates to `/series` (not browser back; prevents ending up off-app).

---

## 9. Accessibility / Fire TV Notes

- All interactive elements must have `aria-label` with context, e.g. `aria-label="Play Season 2 Episode 5 from 18 minutes 42 seconds"` for Continue CTA.
- Season chip state: `aria-pressed` on active; `aria-current="page"` not appropriate (it's not a nav page).
- Focus ring: 2px copper (`--accent-copper`), `box-shadow: 0 0 0 4px rgba(copper, 0.3)` glow. Reuse `.focus-ring` from existing primitives.
- No hover-only affordances. Fire TV remote has no hover; desktop users get focus-equivalent.
- Text sizes: episode row title ≥ 20px on 1080p; synopsis ≥ 16px muted.
- No auto-play sounds on `/series/:id`. Hero backdrop is a still image, not a muted trailer loop (we don't have trailer assets and they'd pull CPU).

---

## 10. Design-phase open questions (flag to implementer)

1. **Continue seed for "partially-watched but >90% done":** treat as watched? Or resume? → Recommend: if `progress/duration > 0.90`, treat as watched and seed "Play S_E_" for the next episode.
2. **Cross-season continue:** if user finishes S1E10 and clicks series card, CTA should be "Play S2E1" (next episode), not "Rewatch S1E10". Requires episode-order knowledge (`episode_num` + `season_number` sort).
3. **Multiple provider accounts per user (future):** if the user adds a premium account later, `canPlay` flips server-side and locked episodes silently become playable. No cache-busting needed if we include `account.allowedFormats` hash in the ETag.
4. **Season "Specials" naming:** Xtream sometimes returns `season_number: 0`. Render as **"Specials"** chip, sort to end.

---

## 11. Out of scope

Trailer autoplay, related-series rail, cast bios, per-episode comments, home-page "continue watching" shelf. Flag in `/backlog/` when detail page ships.

---

SAVED: /home/crawler/streamvault-v3-frontend/docs/ux/02-series.md
