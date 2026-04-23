# 04 — Search (and shared Language Rail component)

**Owner:** UX Lead
**Status:** Revised 2026-04-22 against backend reality (supersedes prior spec)
**Scope:** Search route redesign + the `<LanguageRail>` primitive shared across Live/Movies/Series/Search.
**Parent:** `00-ia-navigation.md`

---

## 0. Reality anchor

| Available | Missing |
|---|---|
| `GET /api/search?q=&type=live\|vod\|series&hideAdult=bool` — Postgres FTS, LIMIT 150 per response, bucketed `{live, vod, series}` | `inferredLang` NOT present on search hits |
| `plainto_tsquery` style tokenization (word-based, stems, AND across words) | No fuzzy / did-you-mean (no `pg_trgm` index shipped) |
| `sv_catalog` indexed via `search_vector` (name weighted A, genre weighted B) | No prefix match by default (search for `vikr` does NOT match `vikram`) |
| `/api/history` and `/api/favorites` exist for empty state (trending/recent would need new endpoints) | No `/api/trending`, no `/api/search/recent` |

**Design consequence:** Search must be honest about what it is — a **multi-word, whole-word, across Live+Movies+Series search**. One small backend tweak is needed to add prefix matching (`vikr` → `vikram`). Language filtering on results is **client-side on the enriched response** (we do one extra lookup to annotate hits with lang).

---

## 1. TL;DR — Decisions

1. **Scope: Live + Movies + Series — all three content types.** Backend already supports it via `type` param.
2. **Behavior**: user types any text; we treat it as space-separated tokens; **all tokens must match as whole words** (order-independent). Case-insensitive. Example: `"vikram 2022"` matches a movie with both tokens anywhere in its metadata. `"vikra"` requires the prefix-match tweak (§5.2) to match `"vikram"`.
3. **Min query length: 2 chars**; debounce **250ms** (down from 300ms); Enter bypasses debounce.
4. **4 language chips on the rail** post-query: Telugu · Hindi · English · All. No Sports chip (per IA §4.1).
5. **Kind chips**: `All · Live · Movies · Series` — purely presentational section filter.
6. **Result routing**: Live hit → play, Movies hit → play, Series hit → navigate to `/series/:id`. Match card-activation matrix (IA §2.3).
7. **Deferred from prior spec**: voice search, did-you-mean, trending rail, recent-searches persistence, year range filter, facet counts. None have backend support. Spec notes what each needs.

---

## 2. Part A — `<LanguageRail />` shared primitive

The rail is already used on Live. This spec formalizes its component API for reuse.

### 2.1 API

```tsx
<LanguageRail
  surface="live" | "movies" | "series" | "search"
  value={lang}                            // controlled; the current selection
  onChange={(lang) => void}               // commits + triggers rebuild
  showContinueWatching?: boolean          // conditional leftmost chip
  onContinueWatchingClick?: () => void
/>
```

### 2.2 Chip set per surface

| Surface | Chips |
|---|---|
| Live | Telugu · Hindi · English · Sports · All |
| Movies | Telugu · Hindi · English · All |
| Series | Telugu · Hindi · English · All |
| Search | Telugu · Hindi · English · All |

Optional leftmost `⏮ Continue` chip when history is non-empty (per IA §6.1).

### 2.3 Behavior

- **Default selection** on mount: read from `sv_lang_pref` (global, via `useLangPref()` hook).
- **Change**: write `sv_lang_pref` and emit `onChange`.
- **Focus**: `focusable: false, trackChildren: true` — norigin forwards ArrowUp-from-toolbar to the first chip.
- **D-pad**: Left/Right walks chips. No wrap. ArrowDown exits to toolbar / grid.
- **Visual state**: active chip = copper fill + bg-base text; idle chip = neutral surface + soft border.

### 2.4 What the rail is NOT

- NOT a server-side filter — the rail's change triggers a re-build of the route's current data (categories union, or annotating search hits).
- NOT a place for "More…" overflow popovers in MVP. Phase 2 brings Tamil / Malayalam / etc. back as an overflow.

---

## 3. Part B — `/search` route

### 3.1 Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  SEARCH                                                            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  🔍  Search channels, movies, series…                        │  │  ← Input
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [Telugu*] [Hindi] [English] [All]                                 │  ← LanguageRail (post-query only)
│  Kind: [All*] [Live] [Movies] [Series]                             │  ← Kind chips (post-query only)
│                                                                    │
│  MOVIES (12)                              See all in Movies →      │
│  [Vikram 2022 TE] [Vikram Vedha TE] [Vikramarkudu TE] [...]        │
│                                                                    │
│  SERIES (3)                               See all in Series →      │
│  [Vikrant Rona TE]  [Vikram HI]  [...]                             │
│                                                                    │
│  LIVE (1)                                                          │
│  [Vikram News 24x7]                                                │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 Initial state (no query)

Input is focused on mount. Below the input: nothing. No trending rail, no recent searches — those require backend endpoints that don't exist. Explicit and honest:

```
┌────────────────────────────────────────────────────────────────────┐
│  🔍  Search channels, movies, series…                              │
│                                                                    │
│  Type to search across Live, Movies, and Series.                   │
│  Try "vikram", "ipl", or "breaking bad".                           │
└────────────────────────────────────────────────────────────────────┘
```

Placeholder hint rotates through 3 examples every 4s.

### 3.3 Typing state (<2 chars)

```
┌────────────────────────────────────────────────────────────────────┐
│  🔍  v                                                             │
│                                                                    │
│  Keep typing… (2 characters minimum)                               │
└────────────────────────────────────────────────────────────────────┘
```

### 3.4 Results state

Fires on debounce (250ms) or immediate on Enter. Shows rail + kind chips + bucketed sections (see §3.1).

Order of sections (authoritative):
1. Movies
2. Series
3. Live

Rationale: when a user searches a title, they usually want the movie/show; Live last because channel-name hits are rare (and if you wanted a channel, you'd go to Live).

**Sort within each section:**
- If we've annotated hits with `inferredLang` (§4), sort pinned-language first: `[langMatches ? 0 : 1, originalOrder]`
- Otherwise backend order (relevance per FTS ranking)

**Section collapse:** if a section has 0 hits and the Kind chip is "All", show section header dimmed with "0 results".

### 3.5 No-results state

```
┌────────────────────────────────────────────────────────────────────┐
│  🔍  zxcvq                                                         │
│                                                                    │
│  No results for "zxcvq".                                           │
│  Try a shorter query or different words.                           │
└────────────────────────────────────────────────────────────────────┘
```

### 3.6 Error state

```
┌────────────────────────────────────────────────────────────────────┐
│  🔍  vikram                                                        │
│                                                                    │
│  ⚠  Search failed. Check your connection.          [ Retry ]       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Search behavior — exact rules

Based on user direction ("3 random words, whole-word, `%text%`"):

### 4.1 Tokenization

- User input is split on whitespace into tokens.
- Empty tokens discarded.
- Example: `"vikram action 2022"` → `["vikram", "action", "2022"]`.

### 4.2 Matching rules

- **Whole-word match**: each token must match a full word in the item's name OR genre (case-insensitive).
  - `"cat"` matches `"Cat Woman"` (word match) but NOT `"Catalog"` (substring in middle of a word). This is Postgres FTS default behavior with `plainto_tsquery`.
- **Multi-word AND**: all tokens must match. Order-independent.
  - `"vikram 2022"` matches an item where the name contains "Vikram" AND the genre or year field contains "2022".
- **Case-insensitive** throughout.
- **Prefix match per token** (the one backend tweak): append `:*` to each token so `"vikr"` matches `"vikram"`, `"vikramarkudu"`, etc.

### 4.3 Backend query shape (after tweak)

Today's backend uses `plainto_tsquery('english', $1)` or similar. To add prefix matching:

```sql
-- Convert plainto_tsquery to tsquery with :* suffix per token
SELECT * FROM sv_catalog
  WHERE search_vector @@ to_tsquery('english', string_agg(token || ':*', ' & '))
  ORDER BY ts_rank(search_vector, query) DESC
  LIMIT 150;
```

Small backend change — flagged as a P1 in `99-grill-findings`. Without it, the frontend spec still works but users type a full word or nothing.

### 4.4 Live hits — name-only match

`sv_catalog` for Live only indexes `name` (no genre/metadata). Search hits Live by channel name only. "Vikram News 24x7" matches `"vikram"`; `"news"` would also match it. This is fine.

---

## 5. Language filter on results

Backend's `/api/search` does NOT return `inferredLang` on hits. Two options:

### 5.1 Client-side annotation (MVP path)

For each hit's `category_id` (or category name if carried), run the same frontend `inferLanguage(categoryName)` function used by list pages. This gives us a 4-value lang per hit.

```
onResults(hits):
  annotated = hits.map(h => ({ ...h, inferredLang: inferLanguage(h.category_name) }))
  return annotated
```

Rail selection then filters + re-sorts the annotated list client-side.

### 5.2 Backend enrichment (Phase 2)

Preferred long-term: backend adds `inferredLang` to search response. One extra field in `CatalogItemSchema` + `/api/search` adapter. Small backend PR; in `99-grill-findings` as open.

**For now**: §5.1 works. Categories are cached; the inference is cheap.

---

## 6. D-pad focus flow

```
Dock(Search) ─ArrowUp─► Input (auto-focused on mount)
                          │
             ┌────────────┴─────────────┐
             ↓ (after query + results)  │ Typing: letters appended
         LanguageRail                   │ Backspace: delete char
             ↓                          │ Enter: submit immediately
         Kind chips                     │
             ↓
         First section
         header / first result card
```

### 6.1 After results arrive

On first successful search after typing, focus **stays in the input**. User can continue typing to refine. Only when user presses `ArrowDown` does focus move into results (first section's first card).

Why: prevents stealing focus mid-typing.

### 6.2 Card activation

Per IA §2.3 card-activation matrix:
- `hit.kind === "live"` → `openPlayer({ kind: "live", ... })`
- `hit.kind === "vod"` → `openPlayer({ kind: "movie", ... })`
- `hit.kind === "series"` → `navigate('/series/${hit.id}')`

---

## 7. Click / keypress budgets

| Task | Typed path | Goal |
|---|---|---|
| Search "vikram" → play top movie | Dock nav (4) + type 6 letters (via on-screen keyboard, ~24 D-pad events) + Enter (1) + Down to first card (1) + Enter (1) | ~31 events, ~9 decisions |
| Refine with kind=Series | +1 ArrowDown + ArrowRight to "Series" chip + Enter | +3 |
| Switch lang filter (Telugu → Hindi) | ArrowUp to LanguageRail + ArrowRight + Enter | +3 |

On-screen keyboard typing is the long pole on Fire TV. The spec **does not try to shortcut it** — the honest answer is "typing is slow, searches should be rare, muscle memory for recent queries would help but requires backend."

---

## 8. Data contract

### 8.1 Endpoint used

```
GET /api/search?q=<query>&type=live|vod|series&hideAdult=true
  → {
      live: CatalogItem[],       // max 50
      vod: CatalogItem[],        // max 50
      series: CatalogItem[],     // max 50
      total: number
    }
```

Backend caps at 150 total hits across buckets. Pagination not supported.

### 8.2 Small backend ask — prefix match (P1)

Tweak `catalog.service.ts` search query to append `:*` to each token. Backward-compatible (no schema change, no new endpoint). See §4.3.

### 8.3 Long-term backend asks (tracked but deferred)

Listed in `99-grill-findings` with priorities:
- `inferredLang` on search hits (P1)
- `/api/trending?lang=telugu&limit=8` (P2)
- `/api/search/recent` persistence (P2)
- `pg_trgm` similarity for did-you-mean (P2)

---

## 9. Persistence

| Key | Value | Lifetime |
|---|---|---|
| `sv_lang_pref` | global | forever |
| Last query | URL `?q=` | browser history |

No recent-searches localStorage yet — a client-only implementation would diverge from the "backend-persisted" long-term plan and cause confusion when multiple devices are used.

---

## 10. Accessibility

- Input: `role="searchbox"`, `aria-label="Search channels, movies, and series"`
- Section containers: `role="region" aria-label="Movies results"` etc.
- Results live region: `aria-live="polite"` announces result counts on every debounce fire
- Chips: `role="radio"` inside `role="radiogroup"`
- Focus return: on Back from a series detail opened from search, focus restores to the originating result card (via ref bookmark)

---

## 11. Decision log

| # | Decision | Alternative rejected |
|---|---|---|
| 1 | Scope = Live + Movies + Series | Movies-only (users expect to search channels too) |
| 2 | Whole-word + multi-word AND | Substring matching (Postgres FTS default behavior is the right fit) |
| 3 | Prefix match (`vikr` → `vikram`) via `:*` | Require full word (too strict for 2-char min) |
| 4 | 4 chips (no Sports) — match Movies/Series | 5 chips (Sports is too noisy on search) |
| 5 | Client-side lang annotation via `inferLanguage(category_name)` | Block on backend enrichment (avoids Phase 1 dependency) |
| 6 | No voice search in MVP | Include (webkitSpeechRecognition unreliable on Fire TV Silk) |
| 7 | No recent searches / trending in MVP | Build with localStorage (diverges from future server-backed) |
| 8 | No did-you-mean in MVP | Add pg_trgm index now (out of scope for this pass) |
| 9 | Debounce 300ms → 250ms | Keep 300ms (user-perceivable latency reduction) |
| 10 | Focus stays in input after first results | Jump to first result (interrupts typing when refining) |

---

**End of spec.**
