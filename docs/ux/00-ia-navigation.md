# 00 — Information Architecture & Navigation Contract

**Owner:** UX Lead · **Status:** Spec (design-only, no code) · **Date:** 2026-04-22
**Scope:** The connective tissue. Dock, routing, back-stack, global sort/filter grammar,
language-first defaults, and the click-budget that every surface must respect.
**Out of scope:** Per-surface design (Series, Movies, Search+Rail are covered by sibling specs 01/02/03).
**Prior art:** Current shipped state is documented in
`~/.claude/projects/-home-crawler/memory/streamvault-v3-session-2026-04-22-handoff.md`
— this spec references it rather than repeats it.

---

## 0. Confirmed vs. prompt mismatch

The prompt listed tabs as *"Live/Movies/Series/Search/Favorites"*. Ground truth from
`src/nav/BottomDock.tsx:10-16` and `src/App.tsx:35-49` is:

> **Live · Movies · Series · Search · Settings** (5 docked tabs)

**Favorites and History are routed but not docked** (`/favorites`, `/history`). This spec
keeps that 5-tab dock (Settings is too frequently needed on a shared Fire TV to bury) and
surfaces Favorites + History as entrypoints from within Live/Movies/Series toolbars and
from Settings. Sibling specs must honour this.

---

## 1. Information architecture map

```
┌───────────────────────────────── APP SHELL ─────────────────────────────────┐
│                                                                             │
│   AUTH GATE ─► (unauth) LOGIN ─► stores token ─► AppShell mounts            │
│                                                                             │
│   ROUTES (React Router 6, BrowserRouter)                                    │
│   ├─ /                 → redirect /live                                     │
│   ├─ /live             ◄── DOCK · Live                                      │
│   │   ├─ LanguageRail  [Telugu | Hindi | English | Sports | All]           │
│   │   ├─ Toolbar       [Sort · EPG-time filter]                            │
│   │   └─ SplitGuide    [channels] ──► Player(kind=live)                    │
│   │                                                                         │
│   ├─ /movies           ◄── DOCK · Movies                                    │
│   │   ├─ LanguageRail  (same 5 chips as Live)                              │
│   │   ├─ Toolbar       [Sort · Year · Genre · Rating]                      │
│   │   └─ PosterGrid    ──► Player(kind=vod)                                │
│   │                                                                         │
│   ├─ /series           ◄── DOCK · Series                                    │
│   │   ├─ LanguageRail  (same 5 chips)                                      │
│   │   ├─ Toolbar       [Sort · Year · Genre]                               │
│   │   └─ PosterGrid    ──► /series/:id (detail, spec 01)                   │
│   │                         └─ season picker → episode list               │
│   │                              └─► Player(kind=series-episode)           │
│   │                                                                         │
│   ├─ /search           ◄── DOCK · Search                                    │
│   │   ├─ SearchInput   (debounced, ≥2 chars)                               │
│   │   ├─ LanguageRail  (filters results post-query)                        │
│   │   └─ Sections      [Live · Movies · Series] → respective player/detail│
│   │                                                                         │
│   ├─ /settings         ◄── DOCK · Settings                                  │
│   │   ├─ Account · Preferences · Playback · Logout                         │
│   │   └─ links → /favorites  · /history                                   │
│   │                                                                         │
│   ├─ /favorites        (NOT docked — reached from Settings or ♥ toolbar)    │
│   │   └─ Mixed grid — Live/Movies/Series — each item routes to its player │
│   │                                                                         │
│   └─ /history          (NOT docked — reached from Settings or ⟲ toolbar)    │
│       └─ Resume-points — single Enter resumes last position                │
│                                                                             │
│   BOTTOM DOCK (fixed, z=100)  ● Live  ▶ Movies  ⊞ Series  ⌕ Search  ⚙ Set │
│   PLAYER OVERLAY (fullscreen, z>dock) — single <video>, single instance    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why this shape:** Dock is the only persistent chrome. Every hero flow is exactly 2 depths
deep (Route → Player) or 3 (Route → Detail → Player, Series only). Favorites/History are
cross-cutting *lists of pointers* — docking them would cost a slot that Settings needs
more (Fire TV households share accounts).

---

## 2. Navigation contract

### 2.1 Dock behaviour (authoritative — already shipped)

| Event                      | Behaviour                                                     | Source of truth            |
|----------------------------|---------------------------------------------------------------|----------------------------|
| Cold auth                  | Focus primes on `DOCK_LIVE` after 100ms + retry loop          | `src/App.tsx:77-97`        |
| Deep link (`/movies`)      | Focus primes on `DOCK_MOVIES` (tab derived from URL)          | `src/App.tsx:56-59`        |
| Dock ArrowLeft / ArrowRight| Walks tab list; does **not** wrap (5 tabs, linear)            | norigin default            |
| Dock ArrowUp               | `setFocus(CONTENT_AREA_<TAB>)` — explicit jump                | `src/nav/BottomDock.tsx:107-113` |
| Dock ArrowDown             | No-op (dock is bottom-most focusable)                         | —                          |
| Dock Enter                 | Navigates to `/{tab}` via React Router `navigate()`           | `src/App.tsx:140`          |
| Escape / Back in content   | `setFocus(DOCK_<ACTIVE_TAB>)`                                 | `src/App.tsx:105-122`      |
| Escape on dock             | No-op (already on dock)                                       | `src/App.tsx:114-115`      |

> **Why no wrap on the dock:** 5 items, 10-foot UI. Wrapping would let a fast ArrowRight
> press overshoot silently (Live→Movies→Series→Search→Settings→Live is one ArrowRight
> too many to notice). Linear + hard stop gives a positive "I'm at the end" signal.

### 2.2 In-route navigation contract

Every content route follows the same vertical stack (top-to-bottom focus order):

```
  ┌─ LanguageRail  ◄─ ArrowUp from Toolbar
  ├─ Toolbar       (Sort + facet chips)
  ├─ Content grid  ◄─ default landing target when tab opens
  └─ Dock          (fixed)
```

**Rules:**

1. On route mount, focus lands on the **content grid's first item**, not the rail.
   (Rationale: 80% of sessions don't change rail/sort. Cheap path = no inputs.)
2. ArrowUp from grid row 1 → Toolbar. ArrowUp from Toolbar → LanguageRail. ArrowUp from
   LanguageRail → no-op (hard stop — no hidden chrome above).
3. ArrowDown from LanguageRail skips Toolbar *only if the Toolbar is empty*. Otherwise
   stepwise: rail → toolbar → grid.
4. Enter on a rail/toolbar chip applies the filter **and returns focus to the grid**
   (so the user isn't stranded in the toolbar after a filter change).
5. Grid is a 2-D focus zone. ArrowLeft at column 0 wraps to end of previous row
   (standard poster-grid behaviour, matches norigin default).

### 2.3 Back-stack semantics — the only diagram you need

```
   DEPTH      STATE                      BACK / ESC presses to get here
   ─────      ─────                      ──────────────────────────────
   0          Dock focused on /live      (cold start)
   1          Content area focused       ArrowUp from dock  (not a "back" step)
   2          Detail route (/series/:id) Enter on a series card
   3          Player overlay open        Enter on episode / channel / movie

   BACK BEHAVIOUR
   Player open  →  close Player, restore focus to originating card     (depth 3 → 1 or 2)
   Detail open  →  router.back() to /series grid, focus the card       (depth 2 → 1)
   Content area →  setFocus(DOCK_<TAB>)                                (depth 1 → 0)
   Dock         →  OS-level back (browser back / Fire TV exit prompt)  (depth 0 → out)
```

**Exit-app contract:** 3 Back presses from deepest point (Player open inside Series detail)
takes the user to the OS. No hidden modals. No double-confirm. Fire TV's own launcher
handles the final Back from the dock — we do not intercept.

> **Why Player → depth 1 (not depth 2) when closing:** Series detail is re-entered via
> history stack (`popstate`) so React Router restores it transparently. Player overlay
> is an *overlay*, not a route — closing it is a state dispatch, not a route change.
> See `src/player/PlayerProvider.tsx:9-11` for the popstate interception.

**Popover back-stack (inside Player):** Quality / audio / subtitle popovers consume one
Back press each before the Player itself closes. This is a micro-stack *inside* depth 3.
Already shipped; smoke-test noted in handoff P1 #4.

---

## 3. Global sort/filter grammar

**Decision:** Every content route uses the **same 3-layer pattern**. Movies, Series,
Search, and Live are siblings — they feel identical.

```
  Row 1 — LanguageRail      [chip] [chip] [chip] [chip] [chip]      (always visible)
  Row 2 — Sort + Facets     Sort: [opt][opt][opt]   Facets: [Year ▾] [Genre ▾] [Rating ▾]
  Row 3+— Content grid      (posters / channels / results)
```

### 3.1 Controls vocabulary

| Control     | Render                  | When to use                                   |
|-------------|-------------------------|-----------------------------------------------|
| **Chip row**| Inline pills, scrollable| ≤6 mutually-exclusive options, hot path       |
| **Segmented**| Inline grouped buttons | 2–4 mutex options, label-critical (Sort)      |
| **Popover ▾**| Button opens overlay   | >6 options OR multi-select (Year, Genre)      |
| **Toggle** | Single button, aria-pressed | Boolean facet (e.g. "Favorites only")    |

No dropdowns with native `<select>`. Fire TV's native select is unreliable with D-pad.

### 3.2 Sort options (shared vocabulary)

| Route   | Sort options                                     |
|---------|--------------------------------------------------|
| Live    | Number · Name · Category *(shipped — LiveRoute.tsx:97)* |
| Movies  | Added (default) · Name · Year · Rating           |
| Series  | Added (default) · Name · Year · Rating           |
| Search  | Relevance (default) · Name · Year                |
| Favorites | Added · Name · Kind                            |
| History | Last watched (default) · Name                    |

"Added" = catalog-added date. User expects newest first.

### 3.3 Filter facets (shared vocabulary)

| Facet      | Render       | Applies to               | Default    |
|------------|--------------|--------------------------|------------|
| Language   | Chip row     | Live / Movies / Series / Search | user pref (see §4) |
| Year       | Popover      | Movies / Series / Search | none (all) |
| Genre      | Popover      | Movies / Series / Search | none (all) |
| Rating     | Popover      | Movies / Series          | none (all) |
| EPG-time   | Segmented    | Live only                | All *(shipped)* |

### 3.4 Persistence — decision: **localStorage for preferences, URL for transient state**

| State                              | Mechanism       | Key                          | Rationale |
|------------------------------------|-----------------|------------------------------|-----------|
| Language preference (global)       | localStorage    | `sv_lang_pref`               | Persists across sessions; set once, used everywhere |
| Per-route sort                     | localStorage    | `sv_sort_{route}`            | Sticky per user, cheap to restore |
| Per-route facets (Year/Genre/etc.) | URL query       | `?year=2024&genre=action`    | Shareable; not worth persisting |
| Search query                       | URL query       | `?q=vikram`                  | Back-button restores the search |
| Selected item in detail routes     | URL path        | `/series/:id`                | Already router-native |

**Why hybrid, not all-URL or all-localStorage:**
- All-URL makes cold login ugly (would need to URL-encode language preference into every
  nav click). Users never share URLs from a Fire TV — URL-as-state has no payoff.
- All-localStorage loses back-button restore for search/facets — hostile UX when the user
  Backs out of the Player and expects the same grid they left.
- Hybrid: identity-scoped prefs in storage, ephemeral filter state in URL. Same pattern
  every major streaming app uses.

**Storage keys already in the codebase** (handoff §P0 #2 + Settings prefs): extend the
`sv_*` prefix consistently. Namespace: `sv_<scope>_<name>`. Examples:
`sv_lang_pref`, `sv_sort_movies`, `sv_pref_subtitle` (existing), `sv_pref_autoplay`
(existing).

---

## 4. Language-first defaults

### 4.1 First-ever launch (no preference set)

- **LanguageRail order:** `Telugu · Hindi · English · Sports · All`
- **Default selection:** `Telugu` (user is primarily Telugu-speaking — stated in handoff).
- **Persistence:** on first change, write `sv_lang_pref=<value>`.

### 4.2 Returning user (preference set)

- **LanguageRail order:** `<preferred> · Telugu · Hindi · English · Sports · All`
  with duplicate removed (e.g. if pref=`hindi`, rail = `Hindi · Telugu · English · Sports · All`).
- **Default selection:** `<preferred>` on every Live/Movies/Series/Search landing.
- **Override:** if the user picks "All" for this session, remember it for the session
  only (in-memory), don't overwrite `sv_lang_pref`. A "Make default" button in Settings
  sets the preference explicitly.

### 4.3 Pinned chips — strictly 5

5 chips fits a 10-foot rail without wrapping at common Fire TV widths (1920×1080 @ 10ft
= ~48px min target, 5 chips × ~160px + gaps ≈ 880px, well under the usable width).
No 6th chip. "Tamil" / "Malayalam" (handoff catalog stats §6) are reachable via an
overflow "More…" popover launched from the Genre facet, not another rail chip — this
keeps the rail stable and the top-level chrome calm.

### 4.4 Implementation note for sibling specs

The language filter in `LiveRoute.tsx:184-203` uses string-pattern matching against
category names. Series and Movies must reuse the **same** `LANGUAGE_PATTERNS` map,
lifted to `src/features/shared/languageFilter.ts` (spec 02/03 to coordinate). One
regex table, four routes. No per-route fork.

---

## 5. Click / keypress budget

Every press counts. **Target: hero tasks ≤ 3 inputs from a focused dock.**

| Hero task                                                  | Current (ship.)| Target | Delta |
|------------------------------------------------------------|----------------|--------|-------|
| Cold login → play favorite Live channel                    | 5–7*           | **3**  | -2–4  |
| Cold login → play latest episode of mid-watch Telugu series| ∞**            | **4**  | fix   |
| Browse Hindi movies → play one                             | 6***           | **4**  | -2    |
| Search "vikram" → play top result                          | ~10 (8 typed)  | **9**  | -1    |
| Resume last watched from anywhere                          | N/A****        | **3**  | new   |

\* Current: Login → ArrowRight to Live if not default (0) → ArrowUp (1) → ArrowDown×N to
channel (N) → Enter (select) → Enter (play) = 2+N+2 presses.
\*\* Series episode picker missing (handoff P0 #1) — currently unplayable from Series tab.
\*\*\* Current: Login → dock ArrowRight→Movies (1) → Enter (2) → ArrowUp to toolbar (3) →
Pick language chip "Hindi" (4) → ArrowDown to grid → Enter (5) → Enter (6 — play).
\*\*\*\* History route exists but no global shortcut / quick-action.

### 5.1 Target flows (step-by-step — sibling specs must hit these)

**A. Live channel (favourite)** — 3 presses
```
  Enter (on DOCK_LIVE, pre-primed)  → enter Live
  ArrowDown ×N (or rail pre-filters to Telugu → focus lands on first Telugu channel)
  Enter                             → play
```
Budget-positive version: if last-played channel is surfaced as row-0 of Live grid
("Recently watched" pinned row — see spec 03), it's **2 presses**: Enter→Enter.

**B. Latest episode of mid-watch Telugu series** — 4 presses
```
  ArrowRight ×2 (Live→Movies→Series)  2
  Enter                               → /series/:id of the mid-watch series
                                       (surfaced as row-0 "Continue watching")
  Enter                               → on "Continue episode" CTA (auto-focused)
                                       → player opens at resume point
```
Requires: (1) Series route surfaces a "Continue watching" row above the main grid,
(2) `/series/:id` detail auto-focuses a "Continue episode" CTA when a resume point
exists — not the season picker.

**C. Browse Hindi movies → play one** — 4 presses
```
  ArrowRight → Movies
  Enter                               → /movies, language rail pre-selects user pref
  (user pref=hindi → no rail press)
  ArrowDown → grid, then ArrowRight/Down to pick poster
  Enter                               → play
```
If user pref ≠ hindi: +1 press (ArrowUp to rail, ArrowRight to Hindi chip, Enter) = 5.
Mitigation: if the user lands with a non-hindi pref and then picks Hindi, offer a
non-modal "Make Hindi the default?" toast after the filter applies (don't interrupt).

**D. Search "vikram"** — 9 presses
```
  ArrowRight ×3 (Live→Movies→Series→Search)
  Enter                         → /search, input auto-focused
  Type v·i·k·r·a·m              6 key events (on-screen keyboard = far more; see below)
  (debounce fires, results render, focus moves to first result via §2.2 rule 4 variant)
  Enter                         → play top result
```
= 3 + 1 + 6 + 0 + 1 = **11 key events** but **9 "decisions"**. We measure decisions,
not raw keypresses. The 6 letters are one motor task.

> **On-screen keyboard** (Fire TV): on-screen entry is slow. Spec 03 (Search) must
> provide a **spoken-query shortcut (Fire TV mic button)** and **search-history chips**
> for last 5 queries. A user who searched "vikram" last week should play in **3 presses**.

**E. Resume last watched from anywhere** — 3 presses (new global action)
```
  Long-press Back / dedicated "Resume" chip on each route's toolbar
  Enter                         → plays last history[0] at resume point
```
Implementation: add a **"Continue watching" chip** to the LanguageRail row on every route
(leftmost, appears only if history is non-empty). Not a language; visually distinct
(different background, ⟲ icon). Spec 02/03 to style.

---

## 6. Open questions / handoffs to sibling specs

### 6.1 For Spec 01 — Series

- Series detail route shape (`/series/:id`) — IA says: season picker (segmented control)
  → episode list (1-D vertical, Enter to play). Must return focus to the originating
  poster card on Back (`popstate` + `<ref>` bookmark pattern).
- "Continue watching" row on `/series` — what's the threshold for showing? (Recommend:
  any series with ≥1 partial-watch in history within last 30 days.)
- Episode cards must show: episode number, title, duration, resume progress bar.
- Confirm: reuse `LanguageRail` pinned-order rule from §4.

### 6.2 For Spec 02 — Movies

- Confirm poster grid aspect `2/3` (matches catalog thumbnails). Item size target: 180×270
  at Fire TV 1080p, 6–7 per row.
- "Continue watching" row above main grid — same rule as Series.
- Facets to ship in MVP: Language · Year · Genre. Rating sort yes, Rating facet can wait.
- Handle the VOD format-tier lock gracefully (handoff §"Known real limitations" #1) —
  render a soft error in-card rather than a full-page ErrorShell when an item returns 0 bytes.

### 6.3 For Spec 03 — Search + Rail

- Confirm: Search's LanguageRail filters **results**, not query. Query is the text;
  rail narrows which section shows (Live/Movies/Series counts).
- Search-history chip row — 5 most recent, localStorage-persisted (`sv_search_recent`).
- Mic / voice shortcut for Fire TV.
- Zero-result state: suggest 3 trending titles in the user's preferred language.
- Result ordering inside each section: Series first → Movies → Live (Series is usually
  the intent when someone searches a title; Live is name-match luck).

### 6.4 For all three sibling specs

1. Reuse `LANGUAGE_PATTERNS` — lift from `LiveRoute.tsx:184-203` to shared module.
2. Reuse toolbar component shell — single `<ContentToolbar>` that composes LanguageRail
   + SortButtons + FacetPopovers. Eliminates drift.
3. Every grid card: 40px min hit target, no hover-only affordances (focus = hover on
   Fire TV), poster has `aria-label` with full title + year.
4. Every route must register `CONTENT_AREA_<TAB>` norigin focusable with
   `trackChildren: true` so the dock ArrowUp jump works — not optional
   (`BottomDock.tsx:107-113` is the caller).
5. Back-to-origin focus restoration on detail routes — use a ref + `useEffect` that
   calls `setFocus(<last-card-key>)` when the route unmounts back to the grid.

### 6.5 Cross-cutting — not owned by any single spec

- **"Continue watching" rail entry**, visible on every route when history is non-empty —
  needs a design (icon + label + focus state) in the polish pass.
- **Favorites star** — current implementation toggles on card (handoff §"Working on live
  URL"). Document the gesture: long-press or dedicated button? Recommend: Menu key on
  Fire TV remote (norigin `onArrowPress("left")` at edge cases conflicts).
- **Language preference onboarding** — consider a one-screen language picker on very
  first login (before `/live` mounts). Trade-off: +1 screen vs. "Telugu" being right for
  this user only. Recommend: skip the onboarding, bake Telugu as the default, offer
  change in Settings.
- **Settings → Favorites / History entry points** — already routed, need visual
  treatment. Settings is the home for everything "about my account" including these.

---

## 7. Decision log (summary)

| # | Decision                                                          | Alternative rejected                              |
|---|-------------------------------------------------------------------|---------------------------------------------------|
| 1 | 5 dock tabs: Live/Movies/Series/Search/Settings                   | Replace Settings with Favorites (buries Settings) |
| 2 | Favorites + History reachable via Settings + toolbar chip         | Dock slot for each                                |
| 3 | Hybrid persistence — localStorage for prefs, URL for filters      | All-URL (ugly), all-local (loses Back)            |
| 4 | Telugu default language, pinned first unless user pref set        | No default (user's first click wasted every time) |
| 5 | 5 chips in rail, no 6th — Tamil/Malayalam under Genre popover     | 7-chip rail (wraps at 1080p)                      |
| 6 | Content grid is the focus target on route mount, not the rail     | Toolbar first (80% sessions don't filter)         |
| 7 | Chip rows over dropdowns (no native `<select>`)                   | Native select (Fire TV D-pad reliability)         |
| 8 | No dock wrap (linear, hard stop)                                  | Wrap (silent overshoot on Fire TV remote)         |
| 9 | Popover back = one micro-stack press inside Player (shipped)      | Direct Player close from popover (loses context)  |

---

**End of spec. Sibling specs begin with decisions, reference this file by section number.**

SAVED: /home/crawler/streamvault-v3-frontend/docs/ux/00-ia-navigation.md
