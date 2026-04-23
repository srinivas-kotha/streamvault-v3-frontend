# 01 — Live TV UX

**Owner:** UX Lead
**Status:** New spec 2026-04-22 (Live was previously covered partially in 00-ia)
**Scope:** `/live` route — channel browsing, EPG overlay, play flow.
**Parent:** `00-ia-navigation.md`

---

## 0. Reality anchor

| Available | Missing |
|---|---|
| `GET /api/live/categories` — live categories, each with `inferredLang` | No server-side multi-facet |
| `GET /api/live/streams/:catId` — channels in a category, with `inferredLang` | No cross-category server union |
| `GET /api/live/epg/:channelEpgId` — program guide for a channel (time-bounded) | No global "now on every channel" single call (iterate client) |
| `GET /api/history` (live included) | No recording / DVR / catch-up |
| `GET /api/favorites` (live channels supported) | — |

Approximate scale: ~1-3k Live channels across all categories (much smaller than VOD).

**Design consequence:** Live can render the full channel list without virtualization, BUT EPG per-channel is a per-request cost. Fetch lazily and cache aggressively.

---

## 1. TL;DR — Decisions

1. **5 language chips**: Telugu · Hindi · English · **Sports** · All. Sports is Live-only (per IA §4.1).
2. **Split layout**: channel list on the left, EPG panel on the right. Same grammar as Netflix's "now playing" panel.
3. **EPG time filter**: `All · Now · Next 2h` segmented control. Already shipped; keep.
4. **Sort**: Number (channel number) · Name · Category. Default Number.
5. **Card Enter = play.** No detail sheet for Live — channels don't have synopses to preview.
6. **Continue-watching chip** leftmost on rail when `/api/history` has live items.
7. **Favorites toggle** via `⋯` overflow menu on the focused channel row (parity with Movies/Series).
8. **No virtualization** for the channel list (small N). EPG fetches are lazy.

---

## 2. Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  LIVE                                                                │  ← route title
│                                                                      │
│  [⏮ Continue] [Telugu*] [Hindi] [English] [Sports] [All]             │  ← LanguageRail (5)
│                                                                      │
│  Sort: [Number*] [Name] [Category]        EPG: [All*] [Now] [2h]     │  ← Toolbar
│                                                                      │
│  ┌──────────────────────┐   ┌───────────────────────────────────┐    │
│  │  ═ Channel list   ═  │   │  Channel preview + EPG             │    │
│  ├──────────────────────┤   ├───────────────────────────────────┤    │
│  │  101 · TV9 Telugu  ● │   │  TV9 Telugu                        │    │
│  │  102 · ETV         ✓ │   │  ────────────────────────────────  │    │
│  │  103 · ETV Plus      │   │  NOW · 19:30–20:00                │    │
│  │  104 · ETV News   ⭐ │   │     "Breaking News Tonight"        │    │
│  │  105 · NTV           │   │  NEXT · 20:00–21:00                │    │
│  │  106 · Star Maa      │   │     "Bathuku Jataka Bandi"         │    │
│  │  107 · Gemini TV   ⋯ │   │                                    │    │
│  │  ...                  │   │  [ ▶ Watch now ]                   │    │
│  └──────────────────────┘   └───────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Zones

1. **Route title** "LIVE" (32px).
2. **LanguageRail** (5 chips + optional Continue-watching chip).
3. **Toolbar**: Sort (Number/Name/Category) + EPG time filter (All/Now/2h). Two segmented controls on one row.
4. **SplitGuide**:
   - **Left panel** (60% width): channel list. 1-D vertical focus.
   - **Right panel** (40% width): currently-focused channel's logo + current/next programs + Watch button.

### 2.1 Card anatomy — channel row

```
┌────────────────────────────────────────────────────────┐
│ 101 · TV9 Telugu            [NEWS]  ● Now: News 24x7 ⋯ │
│   └── channel number              └── focus-only ⋯     │
└────────────────────────────────────────────────────────│
```

Left-to-right:
- Channel number (3 digits, monospace)
- Channel name
- Category tag (small, muted)
- EPG current program summary (when filter=Now or 2h; dimmed when filter=All)
- `⋯` overflow (only on focused row)

State glyphs:
- `● Live` red dot when program is currently airing
- `✓` watched recently (played in last 24h)
- `⭐` favorited
- `⟲` in-progress (if the channel was paused/resumed — rare for Live but possible)

---

## 3. Data retrieval strategy

### 3.1 Channel list (language union)

Same pattern as Movies (§03 §3):

```
1. Fetch /api/live/categories (cached)
2. Filter by current lang: `categories.filter(c => inferredLang(c.name) === lang)`
3. Fetch /api/live/streams/:catId for matching categories in parallel (bounded concurrency)
4. Flatten, dedupe, sort by current sort key
5. Render the full list (no virtualization needed at ~1-3k channels)
```

Cache: 5min session TTL per category. "All" is lazy — fetch as scrolled.

### 3.2 EPG — lazy, focused-channel only

The split guide's right panel fetches EPG for **whichever channel is currently focused**. We do NOT bulk-fetch EPG for every visible channel (that'd be hundreds of requests).

```
onChannelFocusChange(channel):
  if cache.has(channel.epg_id): use cache
  else: fetchEPG(channel.epg_id, now, +3h) → cache 5min
```

### 3.3 EPG time filter's cost

When filter=Now or Next 2h, we still only fetch EPG for the focused channel. But we **annotate the list** with per-channel "current program name" if it's in cache. Channels with uncached EPG show no annotation (not an error — just blank). Cache warms as user scrolls (focus moves → fetch).

**Why lazy not preload:** 1000 channels × 1 EPG request each = 1000 requests on mount. Lazy gives a snappy mount and costs one fetch per focus change.

---

## 4. LanguageRail

See `00-ia §4`. On Live:

- 5 chips: Telugu · Hindi · English · Sports · All
- Continue-watching chip leftmost when applicable
- Default on cold mount: `sv_lang_pref`. If `sv_lang_pref=all`, honor it.
- **Sports**: real category on Live (IPL, cricket, NBA, etc. per Xtream category patterns). When user picks Sports, we union all categories with `inferredLang='sports'` — which is what the backend's pattern matcher returns.

---

## 5. Toolbar

```
Sort: [Number*] [Name] [Category]        EPG: [All*] [Now] [2h]
```

### 5.1 Sort

| Option | Meaning |
|---|---|
| Number | `stream_number` ascending (default) — matches how channel numbers are printed on the guide |
| Name | Alphabetical, locale-aware |
| Category | Group by category name, then by number within category |

### 5.2 EPG time filter

| Option | Meaning |
|---|---|
| All | No EPG annotation on rows; right panel shows full EPG for focused channel |
| Now | Row shows "Now: <program>"; right panel emphasizes current program; no filtering |
| Next 2h | Row shows "Next 2h: N programs"; right panel shows timeline |

**Note:** filter does NOT remove channels from the list — it only changes what's shown *per row*. Removing channels based on EPG availability would be noisy (EPG coverage is spotty).

---

## 6. Focus flow

```
Dock (Live)
   ↓ ArrowUp
LanguageRail
   ↓ ArrowDown        ↑ ArrowUp → dock
Toolbar (Sort + EPG)
   ↓ ArrowDown        ↑ ArrowUp → rail
Channel list ←──────→ Right panel (not focusable; tracks focused channel)
   ↑ Back → dock
```

### 6.1 On route mount

Focus seeds on channel list row 0 (not rail). 80% of sessions just want "play my usual channel."

### 6.2 Within channel list

- `ArrowUp` / `ArrowDown` walks rows
- `ArrowLeft` / `ArrowRight` — no-op on the row itself (1-D list)
- `ArrowRight` on a focused row → moves to `⋯` button (when shown)
- `Enter` on row → play
- `Enter` on `⋯` → overflow menu (Add to favorites / Mark as watched / Remove from favorites if fav)

### 6.3 Back

Back at any point (rail / toolbar / list) → `setFocus(DOCK_LIVE)`.

---

## 7. Card states

Same conceptual states as Movies (§03 §6), adapted for a row layout:

- **Idle**: plain row
- **Focused**: 2px copper ring on the full row
- **Now**: `●` red dot prefix + current program name
- **Watched recently**: `✓` glyph + muted title
- **Favorited**: `⭐` glyph
- **Tier-locked**: rare on Live but possible (HD-only channels). Render `🔒` and dim.

---

## 8. Empty / loading / error states

### 8.1 Loading

Channel list: 8 skeleton rows pulsing. Right panel: empty glass surface with a spinner.

### 8.2 Empty state — language has no channels

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                      📡                                          │
│                                                                  │
│             No Sports channels available.                        │
│                                                                  │
│       The provider hasn't categorized any Live channels          │
│                     as Sports.                                   │
│                                                                  │
│       [ Try Telugu ]  [ Try English ]  [ Show All ]              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Same pattern as Movies — honest, with language-switch alternatives.

### 8.3 Error state

`ErrorShell` with Retry. Distinguish network error from auth error.

---

## 9. Click / keypress budgets

| Task | Target | Path |
|---|---|---|
| Cold mount → play usual Telugu channel | **2** | (Focus on row 0) → Enter = play |
| Mount → scroll to channel #107 → play | **~8** | Scroll down 6 rows + Enter. Normal. |
| Switch to Sports → play IPL | **4** | ArrowUp×2 (toolbar→rail) → ArrowRight×3 (Sports) → Enter → Down + Enter = 6. Target lenient. |
| Favorite a focused channel | **3** | Right (to ⋯) → Enter → Enter |
| Continue-watching jump | **2** | ArrowUp×2 → ArrowLeft to CW chip → Enter. 4 in practice. |

---

## 10. Persistence

| Key | Value | Lifetime |
|---|---|---|
| `sv_lang_pref` | shared global | forever |
| `sv_sort_live` | `number` \| `name` \| `category` | forever |
| `sv_epg_filter` | `all` \| `now` \| `2h` | forever |
| `sv_last_channel` | `channelId` | session; seeds focus on next cold mount |

---

## 11. Accessibility

- Channel row: `role="row"`; row label combines number + name + current program for screen readers
- `aria-live="polite"` on the right panel (EPG updates when focus moves)
- Toolbar segmented controls: `role="radiogroup"` with `aria-label="Sort channels"` and `aria-label="Filter EPG by time"`
- Sports chip gets the same a11y treatment as other languages

---

## 12. Decision log

| # | Decision | Alternative rejected |
|---|---|---|
| 1 | Split layout (list + EPG panel) | Full-width list (wastes 10-foot horizontal real estate) |
| 2 | Lazy EPG fetch on focus change | Bulk EPG preload (hundreds of requests) |
| 3 | EPG time filter annotates rows but doesn't hide them | Hide non-now channels (EPG coverage is spotty; creates false "no results") |
| 4 | No virtualization (list is ~1-3k) | VirtuosoGrid (unnecessary complexity at this scale) |
| 5 | Card Enter = play (no detail) | Detail sheet (channels don't have synopses worth previewing) |
| 6 | 5 chips incl Sports | 4 chips (Live is where Sports lives) |

---

**End of spec.**
