# 03 — Movies UX Spec

Scope: `/movies` only. Align with `00-ia-navigation.md` for URL-state
conventions. No code in this doc.

**Reality anchors:**
- `sv_catalog` VOD: 61,442 rows. All filter/sort/page is server-side (P2 #9
  Postgres migration is a prereq — design assumes that world).
- Xtream `allowed_output_formats: ["ts"]`. Some MP4/MKV return 0 bytes.
  Playback failure is a normal, recoverable state.
- D-pad first. Every affordance reachable without hover.
- PR #45: card click = play. We keep that; "More info" is a deliberate
  second path that does not hijack the primary.

---

## Virtualization mandate

`react-virtuoso` (`VirtuosoGrid`) is **required** for the Movies poster grid. The DOM card count must stay under ~150 regardless of catalog size. Rationale: the VOD catalog has 61,442 rows; without virtualization, the Silk browser on Fire TV OOMs at ~600–1000 rendered cards.

Implementation reference: `MoviesRoute → MovieGrid uses VirtuosoGrid (Issue #59)`.

---

## 1. `/movies` page structure

Three stacked zones, same spatial grammar as `LiveRoute`:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Language rail   [Telugu] [Hindi] [English] [More ▾]        (row 1)  │
├──────────────────────────────────────────────────────────────────────┤
│ Toolbar   Sort: [Latest ▾]   [▤ Filters 2]   12,453 movies  (row 2) │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Poster grid — 6 cols @ desktop 1920, 4 cols @ 10-foot 1080         │
│   Infinite scroll, 60-item pages, sticky scroll position on back.    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

1. **Language rail** — chips: `Telugu | Hindi | English | More ▾`. `Sports`
   omitted (Live concept, not Movies). `More ▾` popover: Tamil, Malayalam,
   Punjabi, etc.
2. **Toolbar** — sort dropdown + filter button + result count.
3. **Poster grid** — paged/infinite, scrolls under a sticky toolbar.

The PR #33 `CategoryStrip` is **replaced**. Xtream VOD categories are noisy
("24/7 1", "4K Collection 2") and the primary browse axis is language.
Categories move into the Filter drawer as "Genre" after P2 #9 normalises them.

**Why:** picking language directly collapses "guess which of ~90 categories
contains Telugu" into one tap. That is the input-count win in §6.

### 1a. Default state — cold login

```
┌──────────────────────────────────────────────────────────────────────┐
│ [*TELUGU*] [ Hindi  ] [ English ] [ More ▾ ]                         │
│                                                                      │
│ Sort: [Latest added ▾]   [▤ Filters]    2,574 Telugu movies          │
│                                                                      │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                           │
│  │ *█ │ │ █  │ │ █  │ │ █  │ │ █  │ │ █  │   ← focus on top-left    │
│  │    │ │    │ │    │ │    │ │    │ │    │                           │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                           │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                           │
│  │ █  │ │ █  │ │ █  │ │ █  │ │ █  │ │ █  │                           │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                           │
└──────────────────────────────────────────────────────────────────────┘
```

`[*TELUGU*]` = active chip (copper fill, `LanguageButton` pattern). `*█` =
focused card (copper ring).

On mount: read `sv_movies_lang` from localStorage (default `telugu`), set
`?lang=te&sort=latest` in URL, fetch page 0. Focus lands on the first
poster, not the language rail — the user already picked "Movies"; re-picking
language they set last session would be a regression.

### 1b. Scroll behaviour

Toolbar is sticky; language rail is **not** (it scrolls away). ArrowUp from
poster row 1 → toolbar; second ArrowUp → language rail (scrolls back into
view). From language rail, ArrowUp → dock (PR #44/46 pattern).

**Why not pin both rows:** two sticky rows eat ~12% of vertical space on
10-foot. Toolbar is in-task; language is pre-browse.

### 1c. Filter drawer open

Right-side slide-in panel, 420px wide. Does **not** cover the toolbar — the
active filter button stays focusable so the user can close with a second
press on the same chip (parity with how the dock tabs toggle).

```
                                  ┌──────────────────────────────────┐
┌────────────────────┐            │ ▤ Filters                    [X] │
│  (grid dimmed 40%) │            ├──────────────────────────────────┤
│                    │            │ Genre                            │
│                    │            │  [*Action*] [ Drama ] [ Comedy ] │
│                    │            │  [ Romance] [ Thriller ] [ +more]│
│                    │            │                                  │
│                    │            │ Year — From                      │
│                    │            │  [*2020*] [2015] [2010] [2005]   │
│                    │            │ Year — To                        │
│                    │            │  [2024] [*2022*] [2020] [2018]   │
│                    │            │                                  │
│                    │            │ Minimum rating                   │
│                    │            │  [ ☆ ][ ☆ ][*★*][ ★ ][ ★ ]       │
│                    │            │  3.0+ stars                      │
│                    │            │                                  │
│                    │            │ [  Reset  ]    [  Apply (842) ]  │
└────────────────────┘            └──────────────────────────────────┘
```

Drawer is a sibling focus region (not a modal). D-pad path: `ArrowUp →
Filter button → Enter (drawer opens, focus on first genre chip) →
ArrowDown/Right to target → Apply`.

Live "Apply (N)" counter updates as filters change (debounced 200ms). If
N=0, button is disabled. On 61k rows with multi-facet, "apply then find out"
is a round-trip nightmare; the counter is the preview.

### 1d. Empty result state

After apply, if result is 0 (user also removed language-chip pre-filter):

```
┌──────────────────────────────────────────────────────────────────────┐
│ Sort: [Rating ▾]   [▤ Filters 4]   0 movies                          │
│                                                                      │
│                                                                      │
│                          (no posters)                                │
│                                                                      │
│                      No movies match all four filters.               │
│                                                                      │
│                    Active: Telugu · Action · 2020-2024 · 4.5+        │
│                                                                      │
│                      [ Loosen year to 2015-2024 ]                    │
│                      [ Drop rating minimum     ]                     │
│                      [ Reset all filters       ]                     │
└──────────────────────────────────────────────────────────────────────┘
```

Loosening actions are server-driven: the facet-count endpoint (§7) returns
which single relaxation yields the largest result. Fallback: generic "Reset
filters" only. **Why:** reset punishes the user for refining; loosening
preserves intent.

### 1e. Loading skeleton

Same grid geometry, pulsing gray rectangles. Toolbar renders immediately
with last-known count so the page does not jump when real data lands.

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Telugu] [Hindi] [English] [More ▾]                                  │
│ Sort: [Latest ▾]   [▤ Filters]    ~12,000 movies                     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                            │
│ │░░░░│ │░░░░│ │░░░░│ │░░░░│ │░░░░│ │░░░░│                            │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                            │
└──────────────────────────────────────────────────────────────────────┘
```

Focus does not auto-advance until the first real poster mounts — prevents
"Enter on a ghost" bugs.

---

## 2. Movie card states

Card is a 2:3 poster, title below, subtle meta line (year · runtime). All
states composite on the same geometry — no layout shift between them.

```
 idle            focused         watched         in-progress     new
 ┌────┐          ╔════╗          ┌────┐          ┌────┐          ┌────┐
 │ █  │          ║ █  ║          │ █ ✓│          │ █  │          │ █ •│
 │    │          ║    ║          │    │          │━━━─│          │    │
 └────┘          ╚════╝          └────┘          └────┘          └────┘
 Title           Title           Title (dim)     Title           Title
 2024 · 2h       2024 · 2h       watched         45% watched     NEW

 tier-locked (0-byte risk)
 ┌────┐
 │ █ ⚠│  ← amber corner chip
 │    │
 └────┘
 Title
 Format limited
```

- **Idle:** default, no chrome.
- **Focused:** copper 2px ring + soft glow, no scale transform
  (`--accent-copper` + `focus-ring`).
- **Watched:** 60% opacity + check badge. Title → `text-secondary`.
  Source: `watch_history` `progress/duration > 0.9`.
- **In-progress:** bottom 3px copper progress bar.
- **New:** dot + "NEW" label (`added_at < 14 days`). Only when sort=Latest.
- **Tier-locked:** amber ⚠ chip when `container_extension` is outside
  `allowed_output_formats`. Needs backend field (§7); until then, the
  overlay in §5 is the safety net.

### 2a. Primary — card click/OK = play

Keep PR #45. OK/click opens the player immediately. No detail page.

Tradeoff:
- ✅ Single-step play; 4-input target in §6 requires it.
- ✅ Netflix/Prime muscle memory on TV.
- ❌ No synopsis preview → bottom sheet (§3) is the escape hatch.
- ❌ Mis-presses cost bandwidth → Back closes player <200ms (PR #46).

### 2b. Secondary — quick-actions popover

Long-press OK (>500ms), Menu key on Fire TV, or right-click on desktop:

```
           ┌──────────────────┐
           │  ▶  Play           │
           │  ☆  Favorite       │
           │  ⓘ  More info      │
           │  •  Mark watched   │
           └──────────────────┘
```

`Play` is redundant with OK but keeps the popover self-documenting.
Long-press alone would violate "no hidden menus", so the focused card also
shows a visible `ⓘ More info` link on its meta line:

```
╔════╗
║ █  ║
╚════╝
Title
2024 · 2h · ⓘ More info
```

Rendered only on the focused card (prevents grid noise). ArrowDown from
poster → More info; second ArrowDown → next row. Long-press is a power-user
shortcut, not the only path.

---

## 3. Movie detail — bottom sheet

Decision: **bottom sheet, not modal, not a new route.**

- Not a route (`/movies/:id`): route change drops scroll position on back.
- Not a full modal: D-pad modal-trap UX on 10-foot is painful.
- Bottom sheet slides to ~60% viewport, grid dims/locks behind it. Back
  closes sheet → focus returns to originating card. No URL change.

```
┌──────────────────────────────────────────────────────────────────────┐
│   (grid dimmed)                                                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────┐   Thalaivar: The Return                         [X close]  │
│  │      │   2024 · 2h 18m · ⭐ 4.3 · Telugu · Action                 │
│  │ █    │                                                            │
│  │      │   After a decade away, a retired commander is pulled...    │
│  └──────┘   ...into one last mission when his family is threatened.  │
│                                                                      │
│   [ ▶ PLAY ]   [ ☆ Favorite ]   [ • Mark watched ]                   │
│                                                                      │
│   Similar  ┌───┐ ┌───┐ ┌───┐ ┌───┐                                   │
│            │ █ │ │ █ │ │ █ │ │ █ │   (horizontal D-pad row)          │
│            └───┘ └───┘ └───┘ └───┘                                   │
└──────────────────────────────────────────────────────────────────────┘
```

Focus order on open: PLAY (copper fill) → Favorite → Mark watched →
Similar row. `Enter` on PLAY opens player. `Back` closes sheet.

**Escape contract (coordinate with player lead):** sheet open → Esc closes
sheet; second Esc goes to dock. Update PR #46 ordering.

### 3a. Invocation paths (all visible)

- Focused card → ArrowDown to `ⓘ More info` → Enter.
- Long-press OK → popover → More info.
- Right-click desktop → popover → More info.

If deep-linking is ever needed, add `?detail=<id>` (opens sheet, doesn't
navigate). Not P0.

---

## 4. Filter + sort persistence

URL = source of truth for ephemeral browse state. localStorage = source of
truth for session-spanning preferences.

### 4a. URL params

```
/movies?lang=te&sort=latest&genre=action,drama&year=2020-2024&rating=3.5
```

- `lang` — `te | hi | en | ta | ml | pa | all`. Multi-select comma-sep
  (`lang=te,hi`, AND-logic).
- `sort` — `latest | alpha | rating | year | watched`.
- `genre` — comma-sep.
- `year` — `YYYY-YYYY` or `YYYY-`.
- `rating` — float min.

Back restores full URL. Scroll position is **not** in URL — kept in an
in-memory map keyed on URL (cleared on tab close).

### 4b. localStorage

- `sv_movies_lang` — last-used lang set. Rehydrated on cold login. **Big
  win:** new session, Telugu already on.
- `sv_movies_sort` — last sort order.
- **NOT persisted:** year, rating, genre. Those are task-scoped; persisting
  would leak last-session's task into this-session's browse.

### 4c. Rehydration

1. Read URL params. 2. Fill missing from localStorage. 3. `replaceState`
back to URL (no history entry). 4. Fetch.

---

## 5. Playback-failure overlay

The Xtream tier lock means many VOD items return 0 bytes. Current UX shows
red "Playback error" — feels like a crash. Redesign:

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                                                                      │
│                           ⚠ Not available                            │
│                                                                      │
│           This title isn't in a format we can stream right now.      │
│                      It's a provider limitation.                     │
│                                                                      │
│          [  Try a similar title  ]   [  Back to browse  ]            │
│                                                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- Amber, not red. Not user's fault.
- Names the cause ("provider limitation") without scaring.
- "Try a similar" picks one of 5 nearest-by-genre+language items with a
  streamable format (needs §7 `container_extension`). Click → plays that
  title. No detour.
- "Back to browse" returns focus to originating card, which now shows the
  tier-locked badge (§2) so the user skips it next time.

Silent auto-skip is disorienting; user deserves to know why their pick
didn't work.

### 5a. Pre-flight prevention (P1)

Once `container_extension` ships, badge tier-locked items in the grid.
Hiding is wrong (user may have a workaround); badging surfaces the risk.

---

## 6. Click/keypress budget

Target flow from requirements: "cold login → watching a Telugu movie in ≤ 4
inputs."

| Task                                | Current inputs | Designed inputs | Delta |
|-------------------------------------|---------------:|----------------:|------:|
| Cold login → Telugu movie playing   | 11             | 4               | -7    |
| Switch language (Hindi → Telugu)    | 6              | 2               | -4    |
| Sort by rating                      | n/a            | 3               | new   |
| Multi-facet filter (Telugu+Action+2022+) | n/a       | 8               | new   |
| Open movie details before playing   | n/a            | 4               | new   |
| Recover from 0-byte playback        | 3 (reload)     | 2               | -1    |

### Cold login → Telugu movie — breakdown

**Current (11):** login (4) + dock Right/Enter to Movies (2) + Up into
strip + Right×3 to Telugu category + Enter (5) + Down to grid + Enter (2).

**Designed (4, post-login):** login is fixed (4); budget starts at dock.
On second+ sessions cookies auto-login.
1. ArrowRight (Live→Movies) · 2. Enter — mounts with Telugu
   pre-selected, focus on first poster.
3. 1 browse input (row 1 poster) · 4. Enter → plays.

First-ever session has no localStorage seed → user taps Telugu once →
budget = 5. One-time cost.

### Multi-facet filter — 8

Up → Right → Enter (drawer) + Right×N → Enter (genre) + Down →
Right (Year-From chip) + Down → Right (Year-To chip) + Down×2 → Enter (Apply).

**Year picker = From/To chip rows** (closes #56). Fire TV remote cannot drive a
two-handle range slider — D-pad has no chord for "select handle, then drag".
Chip pickers are D-pad-trivial and accessible. Earlier draft showed a slider
in §1c; the wireframe in §1c is now the source of truth.

---

## 7. Data contract asks

### 7a. P0 (design can't ship without these)

- `GET /api/vod/search` — replaces `fetchVodStreams(categoryId)`. Params:
  `?lang=te,hi&genre=action&year_min=2020&year_max=2024&rating_min=3.5
  &sort=latest&page=0&page_size=60`. Returns
  `{ items, total, facets }`. Reads `sv_catalog` (P2 #9 prereq).
- `GET /api/vod/facet-counts` — given current filters minus one facet,
  returns counts per candidate. Drives live "Apply (N)" in §1c.
- `added_at` column exposed on `sv_catalog` — Latest sort + NEW badge.
  Sync writes it every 6h; just needs to land in the API response.

### 7b. P1

- `container_extension` per item — badge tier-locked (§2) and pick
  streamable "similar" fallbacks (§5).
- `view_count` — aggregated from `watch_history`. Powers "Most watched"
  sort. If absent, hide the sort option.
- Normalised `genre` — Xtream is free-text. Needs catalog-sync-side
  normalisation (lookup table + LLM tagging). Out of UX scope; flagged.

### 7c. Nice-to-have

- `duration_minutes` — card meta could show "2h 18m". Xtream has it in
  `movie_data.info` inconsistently. Defer.

---

## Handoff notes

- IA lead: align on URL keys (`lang/sort/genre/year/rating`).
- Player lead: Esc contract — sheet → player → dock.
- Backend (P2 #9): `/api/vod/search` + facet counts are blocking.
- QA: visual-QA gate. Screenshots of all §1 states required.

SAVED: /home/crawler/streamvault-v3-frontend/docs/ux/03-movies.md
