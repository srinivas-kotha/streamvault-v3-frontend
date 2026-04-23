# 00 — Information Architecture & Navigation Contract

**Owner:** UX Lead
**Status:** Revised 2026-04-22 against backend reality
**Scope:** The spine. Dock, routes, back-stack, global sort/filter grammar, language-first defaults, click budgets every surface must respect.
**Out of scope:** Per-surface UI (Live/Movies/Series/Search/Settings — each has its own spec).
**Supersedes:** previous 00-ia (design-first; referenced endpoints that do not exist).

---

## 0. Reality anchor — read this first

Every decision below was re-checked against actual backend capabilities on `streamvault-backend@main` (2026-04-22):

| What the backend has | What it doesn't |
|---|---|
| `inferredLang` on list endpoints: `telugu` \| `hindi` \| `english` \| `sports` \| `null` (pattern-matched from category names) — [language-inference.service.ts:19-38](../../streamvault-backend/src/services/language-inference.service.ts#L19) | No `language` column. No multi-language tagging. Tamil/Malayalam/Kannada/etc. fall through to `null`. |
| `GET /api/vod/categories`, `/api/vod/streams/:catId`, `/api/vod/info/:id` | No `/api/vod/search`, no `/api/vod/facet-counts`, no year/genre/rating filters, no pagination. |
| `GET /api/series/categories`, `/api/series/list/:catId`, `/api/series/info/:id` (returns seasons + episodes in one call) | No series-specific search, no trending, no similar. |
| `GET /api/search?q=&type=live\|vod\|series` — Postgres FTS, LIMIT 150 | No `inferredLang` on search results. No facet counts. No did-you-mean. |
| `/api/live/*`, `/api/history`, `/api/favorites` | — |

**Design consequence:** the primary browse axis is **language (4 values + All)**. Every facet beyond language is deferred until backend ships it. Any rail/chip/drawer not supported by the above table is out of MVP.

---

## 1. IA map

```
┌───────────────────────────── APP SHELL ─────────────────────────────┐
│                                                                     │
│  AUTH GATE ─► (unauth) LoginPage  ─► token stored ─► AppShell mounts│
│              (60-day sliding session — see §7)                      │
│                                                                     │
│  ROUTES (React Router 6, BrowserRouter)                             │
│                                                                     │
│  /              → redirect /movies                                  │
│                                                                     │
│  /movies        ◄── DOCK · Movies (landing home)                   │
│    ├ LanguageRail  [Telugu · Hindi · English · All]  (no Sports)   │
│    ├ Toolbar       [Sort: Added·Name   Count: N movies]            │
│    └ PosterGrid (VirtuosoGrid, virtualized) → Player(kind=vod)     │
│                                                                     │
│  /live          ◄── DOCK · Live                                    │
│    ├ LanguageRail  [Telugu · Hindi · English · Sports · All]       │
│    ├ Toolbar       [Sort: Number·Name·Category   EPG: All·Now·2h]  │
│    └ SplitGuide    [channel list + EPG panel] → Player(kind=live)  │
│                                                                     │
│  /series        ◄── DOCK · Series                                   │
│    ├ LanguageRail  [Telugu · Hindi · English · Sports · All]       │
│    ├ Toolbar       [Sort: Added·Name   Count: N series]            │
│    └ PosterGrid    → /series/:id (detail)                           │
│                       └ season chips → episode rows → Player(series-ep)│
│                                                                     │
│  /search        ◄── DOCK · Search                                   │
│    ├ SearchInput   (debounced 250ms, ≥2 chars)                     │
│    ├ ResultFacets  [Kind: All·Live·Movies·Series]  (post-query)    │
│    └ Sections      [Live · Movies · Series] → player / detail       │
│                                                                     │
│  /settings      ◄── DOCK · Settings                                 │
│    ├ Account · Preferences · Playback · Logout                     │
│    └ Links → /favorites · /history                                  │
│                                                                     │
│  /favorites    (NOT docked — reached from Settings or ♥ toolbar)    │
│  /history      (NOT docked — reached from Settings or Resume chip)  │
│                                                                     │
│  BOTTOM DOCK (fixed, z=100)   ▶ Movies  ⊞ Series  ● Live  ⌕ Search  ⚙ Settings │
│                                                                     │
│  PLAYER OVERLAY (fullscreen, z>dock) — spec'd in 05-player.md        │
│    single <video>, single instance, control bar auto-shows on input │
│    [⏮][⏯][⏭]  [◀◀ 10s][10s ▶▶]  [vol]  [audio ▾][subs ▾][quality ▾] │
└─────────────────────────────────────────────────────────────────────┘
```

**Why this shape:** every hero flow is ≤3 depths (Route → Player, or Route → Detail → Player for Series). Favorites/History stay routes-not-tabs because they're pointer lists that don't earn a dock slot over Settings.

---

## 2. Navigation contract

### 2.1 Dock behaviour (shipped — reference only)

| Event | Behaviour | Source |
|---|---|---|
| Cold auth | Focus primes `DOCK_MOVIES` after 100ms + retry (landing is `/movies`) | [src/App.tsx:77-97](../../src/App.tsx#L77) |
| Deep link `/movies` | Focus primes `DOCK_MOVIES` (derived from URL) | [src/App.tsx:56-59](../../src/App.tsx#L56) |
| Dock ArrowLeft/Right | Walks 5 tabs. **No wrap.** | norigin default |
| Dock ArrowUp | `setFocus(CONTENT_AREA_<TAB>)` — explicit | [src/nav/BottomDock.tsx:107-113](../../src/nav/BottomDock.tsx#L107) |
| Dock ArrowDown | No-op (dock is bottom-most) | — |
| Dock Enter | `navigate('/{tab}')` | [src/App.tsx:140](../../src/App.tsx#L140) |
| Escape / Back in content | `setFocus(DOCK_<ACTIVE_TAB>)` | [src/App.tsx:105-122](../../src/App.tsx#L105) |

**No wrap on dock:** 5 items + 10-foot UI. Wrapping lets a fast ArrowRight overshoot silently. Linear + hard stop = positive "end of row" signal.

### 2.2 In-route focus order

Every content route stacks the same way:

```
   LanguageRail   ◄── ArrowUp from Toolbar
   Toolbar        (Sort + per-surface facets)
   Content grid   ◄── default landing target on route mount
   Dock           (fixed)
```

**Rules:**
1. On route mount, focus lands on **content grid's first item**, not the rail. (Rationale: 80%+ of sessions don't change language or sort — cheap path = zero inputs.)
2. ArrowUp from grid row 1 → Toolbar. ArrowUp from Toolbar → LanguageRail. ArrowUp from LanguageRail → no-op (hard stop; nothing above).
3. ArrowDown from LanguageRail skips Toolbar **only if** the Toolbar is empty. Otherwise rail → toolbar → grid.
4. Enter on a rail/toolbar chip applies the filter **and returns focus to the grid**.
5. Grid is 2-D. ArrowLeft at column 0 wraps to end of previous row (norigin default).

### 2.3 Card activation matrix — authoritative

`Enter` / `OK` has different semantics per surface. Every implementor must match:

| Surface | Card | OK action | Reason |
|---|---|---|---|
| `/live` | Channel row | `openPlayer({ kind: "live", ... })` | Direct consumption |
| `/movies` | Movie poster | `openPlayer({ kind: "movie", ... })` | Direct consumption |
| `/series` | Series poster | `navigate('/series/:id')` — **never** openPlayer | A series id is not a stream id |
| `/series/:id` | Episode row | `openPlayer({ kind: "series-episode", ... })` with **episode.id** | Episode id is the stream |
| `/search` result | Depends on `hit.kind` | `live`→play, `movie`→play, `series`→navigate | Mirrors the source route |

Rule: any "play" funnels through `usePlayerOpener` → `openPlayer`. Any "navigate" funnels through `react-router.navigate`. Never let the opener decide internally to navigate.

### 2.4 Back-stack

```
  DEPTH    STATE                        HOW YOU GOT HERE
  0        Dock focused on /live        cold start
  1        Content area focused         ArrowUp from dock (not a back step)
  2        Detail route (/series/:id)   Enter on a series card
  3        Player overlay open          Enter on channel / movie / episode

  BACK:
  Player   → close Player, restore focus to originating card    (3 → 1 or 2)
  Detail   → router.back() to /series grid, focus the card       (2 → 1)
  Content  → setFocus(DOCK_<ACTIVE>)                              (1 → 0)
  Dock     → OS-level back (Fire TV launcher / browser back)     (0 → out)
```

**Exit contract:** 3 Back presses from deepest point → OS. No hidden modals. No double-confirm.

**Player is an overlay, not a route.** Closing is a state dispatch. The PlayerProvider pushes one history sentinel on open ([src/player/PlayerProvider.tsx:81-101](../../src/player/PlayerProvider.tsx#L81)) and consumes it on close — implementors must account for this when computing nav budgets.

**Popover micro-stack inside Player:** quality / audio / subtitle popovers consume one Back press each before Player closes. Already shipped.

---

## 3. Global sort / filter grammar

Three rows per content route. Same vocabulary on all surfaces.

```
  Row 1 — LanguageRail    [chip] [chip] [chip] [chip] [chip]     (always visible)
  Row 2 — Toolbar          [Sort: opt·opt·opt]   [surface facets] [count]
  Row 3+— Content grid     posters / channels / results
```

### 3.1 Controls vocabulary

| Control | Render | When |
|---|---|---|
| Chip row | Inline pills, scrollable | ≤6 mutex options, hot path |
| Segmented | Inline grouped buttons | 2-4 mutex, label-critical (Sort) |
| Popover ▾ | Button opens overlay | >6 options OR multi-select (year range — post-MVP) |
| Toggle | Single button, `aria-pressed` | Boolean (e.g. Favorites only) |

**No native `<select>`.** Fire TV's native select is unreliable with D-pad.

### 3.2 Sort options (what ships)

All sort is client-side over the fetched category. No server-side sort exists.

| Route | Default | Options |
|---|---|---|
| Live | Number | Number · Name · Category |
| Movies | Added (catalog) | Added · Name |
| Series | Added (catalog) | Added · Name |
| Search | Relevance (backend) | Relevance only (no re-sort) |

Year, Rating, "My progress" sorts — **deferred**. Need `/api/vod/search` with per-facet sort, or client-side over Ratings/dates that aren't on the list response. Post-MVP.

### 3.3 Filter facets (what ships in MVP)

| Facet | Render | Routes | Notes |
|---|---|---|---|
| Language | Chip row (§4) | Live / Movies / Series / Search | Primary filter. Real. |
| EPG time | Segmented All / Now / 2h | Live only | Real. Already shipped. |
| Kind | Segmented All / Live / Movies / Series | Search | Client-side section filter |

**Deferred (no backend):** Year range, Genre, Rating min, Trending, Similar, Facet counts, Did-you-mean.

### 3.4 Persistence — localStorage for prefs, URL for transient state

| State | Mechanism | Key |
|---|---|---|
| Language preference (global) | localStorage | `sv_lang_pref` (already canonical) |
| Per-route sort | localStorage | `sv_sort_{route}` |
| Search query | URL query | `?q=vikram` |
| Selected detail item | URL path | `/series/:id` (router-native) |
| Session auth | localStorage | `sv_access_token`, `sv_refresh_token` (see §7) |

Why hybrid: all-URL makes cold login ugly (would need to URL-encode language into every click — users never share Fire TV URLs). All-localStorage loses Back-restore for search. Hybrid is the standard streaming pattern.

---

## 4. Language-first defaults

### 4.1 The chips — fixed order, Sports is Live-only

**Live** (5 chips): `Telugu · Hindi · English · Sports · All`
**Movies / Series / Search** (4 chips): `Telugu · Hindi · English · All`

- No Tamil / Malayalam / Kannada / Punjabi / etc. in MVP. **Phase 2** per user direction; they do not surface today.
- **Sports is Live-only.** IPTV Sports content is overwhelmingly live channels; VOD/Series Sports coverage from Xtream is sparse and inconsistent. Hiding the Sports chip on Movies/Series removes a dead affordance rather than displaying empty states.
- If a user wants to search for a Sports term (e.g. "cricket"), free-text Search still works — Sports-as-a-filter-chip is the only thing we trim there.

### 4.2 First-ever launch (no preference set)

- Default selection: **Telugu** (user's primary language).
- On first change, write `sv_lang_pref=<value>`.

### 4.3 Returning user

- Default selection: `sv_lang_pref` on every Live/Movies/Series/Search landing.
- Chip order stays fixed (no reordering by preference) — users scan by position on 10-foot.
- Session override: if the user picks "All" or "Sports" mid-session, respect for the session. Don't overwrite `sv_lang_pref` unless they explicitly re-pin from Settings.

### 4.4 Implementation

One shared `<LanguageRail>` component. `useLangPref()` hook wraps `sv_lang_pref` localStorage. One module. Every route imports the same thing — **no per-route fork**.

---

## 5. Click / keypress budgets

Every press counts. **Target: hero tasks ≤ 3 inputs from a focused dock.**

| Hero task | Target | Budget path |
|---|---|---|
| Cold login → play Telugu Live channel | **3** | Enter (DOCK_LIVE primed) · ArrowDown to channel · Enter |
| Cold login → play Telugu movie | **3** | Enter (Live) · ArrowRight (Movies) · Enter on first poster (rail pre-primed Telugu) |
| Cold login → resume mid-watch Telugu series | **4** | ArrowRight×2 · Enter (series card) · Enter (Continue CTA auto-focused) |
| Browse Hindi movies → play one | **5** | ArrowRight · Enter (Movies) · ArrowUp · ArrowRight (Hindi) · Enter on poster · Enter (one per step — accepted overshoot for non-pref language) |
| Search "vikram" → play top result | **9** | Dock nav (4) · type 6 letters · Enter (debounce fires, focus top result, Enter) |
| Resume last watched from anywhere | **3** | Continue-watching chip (leftmost in LanguageRail) · Enter |

Budgets depend on:
- Route mount focuses grid row 1, col 1 (§2.2 rule 1)
- LanguageRail respects `sv_lang_pref` on mount (§4)
- Series detail auto-focuses Continue/Play CTA (covered in 02-series)
- A "Continue watching" chip, leftmost in the LanguageRail, appears when `/api/history` is non-empty (see §6.1)

---

## 6. Cross-cutting primitives (shared across sibling specs)

### 6.1 Continue-watching chip

Leftmost slot in the LanguageRail on `/live`, `/movies`, `/series`. Different visual treatment from language chips (⟲ icon, neutral background). Conditional: only renders when `/api/history` returns ≥1 item. Enter → plays the most recent resume point (respects its kind — Live channel / VOD / series-episode).

### 6.2 Tier-locked badge

When a VOD / episode has `containerExtension` outside the Xtream account's `allowedFormats`, render a 🔒 glyph + dimmed opacity. List endpoints don't carry `containerExtension`, so full badging is only possible after detail-fetch — this is a known gap (see 03-movies.md §5 and 02-series.md §4 for precheck vs reaction tiers).

### 6.3 Playback-failure overlay

When playback errors (0-byte stream, network, unsupported codec), show a consistent amber overlay with specific copy and two recovery actions. Spec'd per-surface in 03-movies §5 and 02-series §4.

### 6.4 Empty states

Every content route has three empty variants:
- **No data yet** (loading) — skeleton
- **Loaded, genuine empty** ("No Sports movies in this catalog" / "No episodes this season")
- **Error** — uses shared `ErrorShell` with Retry

Movies' "no results because filters clash" variant from the previous spec is **deferred** — it required facet counts we don't have.

### 6.5 Loading skeletons

Same grid geometry, pulsing gray. Toolbar renders immediately with last-known count so the page does not jump. Focus does not auto-advance until the first real card mounts (prevents "Enter on a ghost").

### 6.6 Reduced motion

All copper-glow focus rings + sheet slide animations must respect `@media (prefers-reduced-motion: reduce)`. Currently not implemented — added to Phase 6 polish.

### 6.7 Typography system — one scale, every surface

Single font family, single type scale, same tokens everywhere. No per-route overrides.

| Token | Size (1080p) | Weight | Use |
|---|---|---|---|
| `--type-hero` | 48px | 700 | Detail page hero title (series detail) |
| `--type-title-lg` | 32px | 600 | Route title ("MOVIES"), section headers |
| `--type-title` | 24px | 600 | Card titles, toolbar labels |
| `--type-body` | 20px | 500 | Episode row titles, channel names |
| `--type-body-sm` | 16px | 400 | Synopsis, meta line (year · duration) |
| `--type-caption` | 14px | 500 | Chip labels, badges, timestamps |
| `--type-overline` | 12px | 600 uppercase | Section labels ("CONTINUE WATCHING") |

**Font family:** Inter Display (discrete weights 400 / 500 / 600 / 700), `display=optional` loading per research DECISIONS. No variable-font (Fire OS Silk WebKit weight collapse).

**Line heights:** 1.2 for titles, 1.4 for body, 1.1 for hero.

**Rule:** if you need a size that isn't in the table, the token is wrong — don't invent a new one, update the table.

### 6.8 Glass / surface treatment — one visual language

Every overlay surface (toolbars, popovers, player controls, bottom sheet, overflow menus) uses the same "frosted glass" treatment. No per-surface styles.

| Surface | Background | Blur | Border |
|---|---|---|---|
| Base page | `--bg-base` `#12100E` (solid, no blur) | — | — |
| Card idle | `--bg-surface` `rgba(255,255,255,0.04)` | — | 1px `rgba(255,255,255,0.08)` |
| Card focused | `--bg-surface` + copper ring | — | 2px `--accent-copper` + glow |
| **Toolbar / Rail** | `rgba(18,16,14,0.72)` | `backdrop-filter: blur(16px)` | bottom 1px `rgba(255,255,255,0.06)` |
| **Popover / menu** | `rgba(18,16,14,0.85)` | `backdrop-filter: blur(24px)` | 1px `rgba(255,255,255,0.08)`, 12px radius |
| **Bottom sheet** | `rgba(18,16,14,0.88)` | `backdrop-filter: blur(24px)` | top 1px `rgba(255,255,255,0.08)`, 16px radius top corners |
| **Player controls** | `rgba(0,0,0,0.45)` gradient top + bottom | `backdrop-filter: blur(12px)` on control bar only | — |

**Focus ring (everywhere):** `box-shadow: 0 0 0 2px var(--accent-copper), 0 0 24px 4px rgba(200, 121, 65, 0.35)`. One token, every focusable, no exceptions.

**Rule:** any surface that floats above content uses blur. Any surface that IS content (cards, rows, page background) does not. This prevents blur-on-blur murk.

---

## 7. Authentication & session — 60-day sliding

Product requirement: users stay logged in as long as they use the app at least once every 60 days.

### 7.1 Token shape

| Token | Storage | TTL | Purpose |
|---|---|---|---|
| `sv_access_token` | **localStorage** (change from sessionStorage) | 15 min | API bearer |
| `sv_refresh_token` | localStorage | **60 days, sliding** (change from 90d) | Refresh access, rotated on use |

Moving access token to localStorage closes the "tab close = logout" loophole that currently forces re-login after every cold start. Both tokens are cleared on explicit Logout.

### 7.2 Sliding window

Backend already issues a fresh `expires_at` on every successful `/auth/refresh` ([auth.router.ts:230](../../streamvault-backend/src/routers/auth.router.ts#L230)). Changing TTL from 90 → 60 days satisfies the product requirement. Sliding is automatic — no new logic needed server-side beyond the constant change.

### 7.3 Silent refresh on boot

Today: refresh only fires reactively on a 401 response.
Required: on app boot (before the auth gate decides), attempt `/auth/refresh` if a refresh token exists. Auth gate treats "refresh succeeded" as "still logged in". Fires exactly once on mount; subsequent 401s keep the existing reactive path.

### 7.4 Logout

Already clears both tokens and hits `POST /auth/logout` to revoke refresh server-side. No change.

---

## 8. Decision log

| # | Decision | Alternative rejected |
|---|---|---|
| 1 | Keep 5-tab dock: Live · Movies · Series · Search · Settings | Replace Settings with Favorites (buries Settings; shared Fire TV households need it) |
| 2 | Favorites + History are routes, not dock tabs; reached from Settings and/or in-toolbar chips | Dock slot for each |
| 3 | Language is the primary browse axis on every content surface | Category-first (categories are noisy and language is the real intent) |
| 4 | 5 language chips, fixed order (Telugu · Hindi · English · Sports · All) | Preference-first ordering (confusing on 10-foot — muscle memory matters more) |
| 5 | Telugu is the install default | No default (wastes first click every time) |
| 6 | Hybrid persistence — localStorage for prefs, URL for filters | All-URL (ugly) / all-local (loses Back) |
| 7 | Chip rows over dropdowns (no native `<select>`) | Native select (Fire TV D-pad unreliable) |
| 8 | No dock wrap (linear, hard stop) | Wrap (silent overshoot) |
| 9 | Defer Year / Genre / Rating facets until backend ships `/api/vod/search` | Fake client-side filters over fetched pages (misleading at 61k rows) |
| 10 | Access token moves to localStorage + refresh TTL 60d sliding | Keep sessionStorage (incompatible with "stay logged in") |
| 11 | **Sports chip is Live-only.** Movies/Series/Search show 4 chips (no Sports). | Sports on all surfaces (most Xtream VOD/Series has no Sports content — dead affordance) |
| 12 | Continue-watching is a chip in LanguageRail, not a separate row | Dedicated row above grid (valuable but costs vertical space; chip is cheaper) |
| 13 | **Typography: single Inter Display scale, 7 tokens (§6.7).** No per-route overrides. | Per-surface type scales (drift + inconsistency on 10-foot) |
| 14 | **Glass/surface treatment: frosted-glass blur on overlays only, never on cards (§6.8).** | Blur everything (blur-on-blur murk) or no blur (no depth cues on 10-foot) |
| 15 | **Player UX is spec'd separately in `05-player.md`** — full control bar, auto-show on input, popovers for audio/subs/quality | Reuse existing chrome (player is fundamentally different — overlay, not a route) |
| 16 | **Search covers all 3 content types (Live + Movies + Series).** Behavior: word-tokenized, multi-word AND, prefix-match (`vikr` → `vikram`). Details in `04-search`. | Search only on Movies (confusing when user types a channel name) |

---

**End of spec.** Sibling specs (`01-live`, `02-series`, `03-movies`, `04-search-and-language-rail`) reference this file by section number. `99-grill-findings.md` tracks which grill findings this revision closes.
