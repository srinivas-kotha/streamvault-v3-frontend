# StreamVault v3 — Adaptive Responsive Layer: Frontend Architecture

**Status:** Plan (2026-04-29)  
**Scope:** Desktop (mouse + keyboard) + Mobile (touch + gestures), zero Fire TV d-pad regression  
**Stack:** React 19, Vite 5, Tailwind 4 (Oxide), react-router-dom 6, Zustand, HLS.js, mpegts.js  
**Budget constraint:** TV initial bundle ≤ +30 KB gz (current ~213 KB gz)

---

## 1. Current State Audit

### 1.1 Input Mode

There is **no `InputModeProvider`** in the current codebase. The term appeared in sprint notes but was never implemented. The closest infrastructure:

- **`src/nav/spatialNav.ts`** — initializes `@noriginmedia/norigin-spatial-navigation` v2.1.0. `shouldFocusDOMNode: true` ties norigin's internal focus pointer to `document.activeElement`.
- **`src/App.tsx`** — UA-sniff on `navigator.userAgent` at boot sets `data-tv="true"` on `<html>`. This is the only "platform mode" concept in production (`/src/main.tsx` lines 20-30).
- **`src/player/PlayerControls.tsx`** — `window.addEventListener("mousemove", onMouseMove)` is the only existing mouse/pointer listener; it only wakes the player chrome, nothing else.
- No `pointer: coarse` media-query consumers. No touch event handlers anywhere.

### 1.2 Layout

- **No `src/layout/` directory.** Layout lives in:
  - `src/App.tsx` — `AppShell` wraps routes in a single `<div>` with `background: var(--bg-shell-gradient)`.
  - `src/nav/BottomDock.tsx` — fixed floating pill, `position: fixed; bottom: var(--dock-bottom-offset)`.
  - Individual route files (`MoviesRoute.tsx`, etc.) — each owns its own flex/grid layout.

### 1.3 Breakpoints & Tokens

`src/brand/tokens.css` defines:
- `[data-tv="true"]` attribute selector (UA-sniffed) — fluid clamped type + spacing scale.
- CSS media queries at `960 / 1280 / 1600 / 1920 px` — only change `--poster-min-width` for TV auto-fill grids.
- `--gutter-tv: 48px`, `--gutter-mobile: 24px`, `--dock-height: 80px` — not yet conditioned on viewport (they're TV defaults).
- No desktop-specific breakpoints. No mobile-specific breakpoints. No `pointer: coarse` / `hover: none` queries.

Tailwind 4 used via `@tailwindcss/vite` plugin. Zero `tailwind.config.*` — config lives entirely in `@theme {}` block inside `src/index.css`. No container-query plugin registered.

### 1.4 Focus Management

- norigin spatial-navigation owns all d-pad focus; `setFocus()` is called imperatively throughout.
- `src/nav/backStack.ts` — per-route originator map for Netflix-style focus restoration on pop.
- `src/App.tsx` — `focusin` + `keyup` recovery watcher; popstate sentinel exit guard.
- `src/player/PlayerControls.tsx` — full keyboard map (`Escape`, `Back`, media keys, `Space`, `j/k/l`) installed via capture-phase `window.addEventListener`.
- There is **no `tabIndex` management strategy** for non-TV platforms. All interactive elements get `tabIndex={-1}` or norigin-managed focus. Tab-key navigation for desktop is currently broken.

---

## 2. Gap Analysis

### Desktop (mouse + keyboard) gaps

| Gap | Impact |
|-----|--------|
| No hover states on cards/dock | Cards show d-pad copper ring only; no `:hover` CSS |
| No cursor: pointer on interactive elements | Buttons have `cursor: default` in control bar |
| Tab-order broken | norigin absorbs focus; `tabIndex={-1}` everywhere means keyboard Tab goes nowhere useful |
| Player: click-to-play on scrubber bar is missing | `<div role="progressbar">` is not a `<input type="range">` |
| Player: mouse-drag scrub missing | Scrubber is a static progress bar div |
| No right-click / context menu handling | Fine to suppress, but needs explicit `onContextMenu` |
| BottomDock hits bottom of screen on small desktops | Needs layout adaptation for side-nav or top-nav |
| `pointer-events: none` on controls when `visible === false` — fine for TV, breaks mouse hover re-entry | PlayerControls already has `onMouseMove` → `wake()` wired, so partial fix exists |

### Mobile (touch + gestures) gaps

| Gap | Impact |
|-----|--------|
| No touch gesture handling in player | Tap-to-show controls, swipe-to-seek, pinch-to-fullscreen all missing |
| BottomDock pill has no touch affordance adjustments | 80px height is fine; tap targets are adequate |
| Horizontal poster rails: no swipe | react-virtuoso handles overflow; touch-scrolling works natively but no snap or momentum override |
| No safe-area insets beyond dock (`env(safe-area-inset-bottom)`) | Route content doesn't account for notches |
| Fullscreen request fires on any `pointerdown` — good for TV, wrong for mobile PWA | On iOS, fullscreen API is partially restricted |
| No pull-to-refresh prevention | `overscroll-behavior: none` not set globally |
| Focus ring visible on touch (copper outline shows after tap) | Needs `:focus-visible` vs `:focus` split |

### Both platforms: feature flag system missing

No feature flag client exists. New input-mode behaviors cannot be safely enabled/disabled per-environment without one.

---

## 3. Gesture Engine Choice

**Recommendation: `@use-gesture/react` v10**

### Evaluation matrix

| Library | Bundle (gz) | React 19 compat | Passive-safe | Pointer-events based | Active dev (2026) |
|---------|-------------|-----------------|--------------|---------------------|-------------------|
| `@use-gesture/react` v10 | ~7 KB gz | Yes | Yes | Yes | Yes (Poimandres) |
| `hammerjs` | ~7.5 KB gz | No (no maintainer since 2023; no React wrapper) | No (uses touch events) | No | No — archived |
| `interactjs` | ~25 KB gz | Community wrapper only | Partial | Partial | Slow |
| Custom pointer events | 0 KB | N/A | Yes | Yes | N/A |

**Why `@use-gesture/react`:**

1. **Pointer-events API only** — works identically on touch, mouse, and stylus. No separate touch/mouse codepaths.
2. **Passive listener compatible** — the library handles `{passive: false}` opt-in only where preventDefault is needed (e.g. swipe in a scrolling container). TV receives no gesture bindings so it pays zero cost.
3. **Tree-shakeable** — only `useDrag` + `useGesture` are needed; the others are not bundled. Net addition: **≈6.8 KB gz**.
4. **Pointer-capture** — automatically calls `setPointerCapture` so scrubber drags don't break when the cursor leaves the element.
5. **Zero conflict with norigin** — norigin listens on `keydown`; `@use-gesture` listens on `pointerdown/pointermove/pointerup`. No shared event path.

**TV bundle delta:** TV chunk does NOT import gesture bindings. Gesture hooks are only imported inside `PlayerGestureLayer` (lazy) and `DesktopScrubber` (lazy). Vite tree-shaking + dynamic import keeps the `@use-gesture/react` code out of the main TV bundle entirely. **TV delta: 0 KB.**

**Desktop/mobile delta:** ≈6.8 KB gz added to the player chunk only, which is already lazy-loaded.

---

## 4. Input-Mode Abstraction

### 4.1 Design

```
src/
  nav/
    InputModeProvider.tsx    ← new
    useInputMode.ts          ← new (re-exports context)
```

**Detection signals (priority order):**

| Priority | Signal | Sets mode |
|----------|--------|-----------|
| 1 | `pointerdown` with `e.pointerType === 'touch'` | `touch` |
| 2 | `pointermove` with `e.pointerType === 'mouse'` AND `e.movementX | Y > 2` | `mouse` |
| 3 | `keydown` with arrow/Enter/Space/Back key | `keyboard` (TV d-pad or desktop KB) |
| 4 | Boot: `window.matchMedia('(pointer: coarse)')` | `touch` if true, else `mouse` |

**Sub-modes (orthogonal to input mode):**

```ts
type InputMode = 'keyboard' | 'mouse' | 'touch';
type PlatformHint = 'tv' | 'desktop' | 'mobile'; // from UA sniff + viewport
```

**Hook API:**

```ts
// src/nav/useInputMode.ts
interface InputModeContext {
  mode: InputMode;          // last active input type
  platform: PlatformHint;  // stable UA-derived hint
  isTV: boolean;            // === platform === 'tv'
  isMouse: boolean;         // mode === 'mouse'
  isTouch: boolean;         // mode === 'touch'
  isKeyboard: boolean;      // mode === 'keyboard'
}

export function useInputMode(): InputModeContext { ... }
```

**Implementation notes:**

- `InputModeProvider` is a React context with a single `useReducer`. State transitions are synchronous to avoid layout jitter.
- TV platform: `isTV` is derived from `document.documentElement.dataset.tv === 'true'` (already set by `main.tsx` UA sniff). `InputModeProvider` reads this once on mount; it's stable.
- Touch detection: listen `pointerdown` on `window` with `{passive: true, capture: true}`. Check `e.pointerType === 'touch'`. If true, dispatch `SET_TOUCH`. This fires before any component handler, so the mode is correct by the time React processes the event.
- Mouse detection: listen `pointermove` on `window` with `{passive: true}`. Only dispatch `SET_MOUSE` if `e.pointerType === 'mouse'` AND movement exceeds 2px threshold. This prevents spurious mouse-mode on Silk TV (it fires one `pointermove` on d-pad navigation).
- Keyboard detection: listen `keydown` on `window` (existing listeners don't interfere; this is a separate, additive listener).
- `pointer: coarse` media query watcher: `window.matchMedia('(pointer: coarse)').addEventListener('change', ...)` for physical keyboard/mouse plug-in.

**norigin guard:** InputModeProvider MUST NOT disable norigin on `mode === 'mouse'`. norigin's `init()` is called once in `main.tsx` before React mounts; there's no teardown API in v2.1.0. Instead, norigin stays active always. Mouse/touch interactions use React's `onClick` / gesture hooks directly and norigin's spatial nav is a parallel system — both work simultaneously.

---

## 5. Responsive Layout Strategy

### 5.1 Breakpoint additions (tokens.css)

Add three new attribute/query combinations **without touching existing `[data-tv="true"]` blocks:**

```css
/* Desktop: ≥1024px AND pointer:fine AND hover:hover */
@media (min-width: 1024px) and (pointer: fine) and (hover: hover) {
  :root:not([data-tv="true"]) {
    --layout-mode: desktop;
    --gutter-page: 64px;
    --nav-mode: side;         /* triggers TopNav → SideNav swap */
    --dock-display: none;
  }
}

/* Mobile: pointer:coarse OR viewport < 768px */
@media (pointer: coarse), (max-width: 767px) {
  :root:not([data-tv="true"]) {
    --layout-mode: mobile;
    --gutter-page: 16px;
    --nav-mode: bottom;
    --dock-display: flex;
    overscroll-behavior: none;
  }
}
```

### 5.2 AppShell layout adaptation

**Strategy: ONE component, CSS-controlled layout — not separate components.**

Rationale: Separate desktop/mobile components double the maintenance surface and break HMR continuity. CSS-only switching via `--nav-mode` / `--layout-mode` tokens keeps the React tree identical across platforms, with only visual layout changing.

```
┌─ AppShell (root div) ──────────────────────────────┐
│  [data-nav-mode="side"]  →  display: flex; flex-row│
│  [data-nav-mode="bottom"] →  display: block         │
│                                                      │
│  SideNav (hidden on TV + mobile via CSS)             │
│  ┌─ main content area ──────────────────────────┐   │
│  │  <Routes />                                  │   │
│  └──────────────────────────────────────────────┘   │
│  TopBar (desktop only — search, user menu, logo)     │
│  BottomDock (TV + mobile only)                       │
└──────────────────────────────────────────────────────┘
```

`AppShell` reads `useInputMode().platform` and sets `data-nav-mode` on its root div. `SideNav` and `TopBar` are added as **new lazy components** — they import nothing from the TV path and are not in the initial TV bundle.

### 5.3 Container queries

Tailwind 4 supports `@container` natively via the `@tailwindcss/vite` plugin (no separate plugin needed — confirmed in Tailwind 4 Oxide release notes). Poster cards can use `@container` queries for self-contained density adaptation without coupling to viewport width.

```css
/* In card.css — no Tailwind config change needed */
.poster-card-container { container-type: inline-size; }

@container (min-width: 200px) {
  .poster-label { font-size: var(--type-body-sm); }
}
```

### 5.4 BottomDock on desktop

On desktop (`--nav-mode: side`), BottomDock gets `display: none` via CSS. `BottomDock` still mounts in the React tree (norigin focus keys stay registered; avoids unmount/remount churn on resize). Pointer events are already gated by `pointerEvents: hidden ? "none" : "auto"` — add `display: none` via a `data-hidden` attribute + CSS rule so screen readers also skip it.

---

## 6. Player Adaptive Controls

### 6.1 Architecture

The player currently has:
- `PlayerShell.tsx` — full-screen overlay, FocusContext, video element
- `PlayerControls.tsx` — d-pad keyboard interceptor + three-band overlay UI

Add **`PlayerGestureLayer.tsx`** — a new component that wraps `PlayerShell`'s video area with gesture bindings. It is rendered **only on touch/mouse** platforms and **lazy-imported** so TV bundle is unaffected.

```
PlayerShell
├── <video ref={videoRef} />
├── PlayerGestureLayer (lazy, touch+mouse only)
│     useGesture({ onDrag: scrub, onTap: toggle, onDoubleTap: seek±10 })
│     Renders: TapZones (left/right ±10s visual ripple)
├── PlayerControls (always — d-pad keyboard interceptor stays unconditional)
│     Existing keyboard handler unchanged
│     NEW: DesktopScrubber replaces <div role="progressbar"> on mouse mode
└── FailureOverlay
```

### 6.2 Gesture map (YouTube-style)

```
TOUCH GESTURES (PlayerGestureLayer)
────────────────────────────────────────────────────────
Single tap anywhere         → toggle controls visibility (wake/hide)
Double tap left third       → seek -10s  (ripple: ◀◀ 10s)
Double tap right third      → seek +10s  (ripple: ▶▶ 10s)
Swipe left/right (VOD)      → seek proportional to swipe distance
  - 0-25% screen width      → ±10s
  - 25-60%                  → ±30s
  - 60%+                    → ±60s
  (uses same seekWithRate logic from PlayerControls)
Swipe up/down               → volume (0.05 per 8px swipe)
Long press (500ms)          → 2× speed playback (release = normal)

MOUSE GESTURES (DesktopScrubber)
────────────────────────────────────────────────────────
Hover scrubber bar          → expand to 8px height + preview tooltip
Click scrubber              → seek to position
Drag scrubber thumb         → live scrub (pointer capture)
Scroll wheel on video       → volume ±5%
Click video area            → toggle play/pause
Double click video area     → fullscreen toggle

D-PAD (PlayerControls — unchanged)
────────────────────────────────────────────────────────
Arrow Left/Right on transport → seekWithRate() tap-rate accelerator
Arrow Up → PLAYER_BACK
Arrow Down → settings row
Enter → play/pause or confirm
Escape/Back → close or dismiss menu
Media keys → mapped (existing)
```

### 6.3 ASCII wiring diagram

```
PlayerShell.tsx
│
│  isTV (from InputModeContext)
│  ├─ true  ─────────────────────────────────────────────►  skip gesture layer
│  └─ false
│         │
│         ▼
│   <Suspense fallback={null}>
│     <PlayerGestureLayer         ← lazy import
│         videoRef={videoRef}
│         onSeek={seek}
│         onTogglePlay={toggle}
│         onSetVolume={setVolume}
│     />
│   </Suspense>
│
│  <PlayerControls
│      ...existing props...
│      onSeek={seek}              ← shared seek fn, same tap-rate logic
│      scrubberVariant={          ← NEW prop
│        isMouse ? 'desktop' : 'tv'
│      }
│  />
│
└─ D-pad keyboard interceptor: UNCHANGED, always active
```

### 6.4 Key constraint: d-pad must not regress

`PlayerControls.tsx` keydown listener is installed as `window.addEventListener("keydown", onKeyDown, true)` (capture phase). It must **never** be conditioned on input mode. Gesture bindings only add `pointerdown/pointermove/pointerup` handlers — different event types, zero conflict.

---

## 7. Feature Flag Client

### 7.1 Backend contract

The backend's `settings.router.ts` is currently a 501 stub. The feature flag endpoint will be added as **`GET /api/config/flags`** in Phase 1. Expected response shape:

```ts
// GET /api/config/flags
// Auth: optional (bearer token if authed, public defaults otherwise)
interface FeatureFlagsResponse {
  flags: {
    // Phase 1
    adaptive_responsive: boolean;    // master switch for entire adaptive layer
    desktop_side_nav: boolean;       // SideNav vs BottomDock on desktop
    mobile_gestures: boolean;        // PlayerGestureLayer on touch
    desktop_scrubber: boolean;       // DesktopScrubber in PlayerControls
    // Phase 2+
    mobile_player_gestures: boolean;
    desktop_top_bar: boolean;
    container_queries: boolean;
    [key: string]: boolean;          // forward-compatible
  };
  ttl_seconds: number;               // client cache TTL
}
```

### 7.2 Client implementation

```
src/
  lib/
    featureFlags.ts          ← store + fetch logic
    useFeatureFlag.ts        ← hook
```

**`featureFlags.ts`:**

```ts
const LS_KEY = 'sv_feature_flags';
const LS_TTL_KEY = 'sv_feature_flags_ttl';

// Env fallback (set in .env.local for dev override):
//   VITE_FF_ADAPTIVE_RESPONSIVE=true
const ENV_PREFIX = 'VITE_FF_';

function getEnvFallback(name: string): boolean | undefined {
  const key = `${ENV_PREFIX}${name.toUpperCase()}`;
  const val = import.meta.env[key];
  if (val === 'true') return true;
  if (val === 'false') return false;
  return undefined;
}

// Zustand slice (granular selector — no re-render unless the specific flag changes)
interface FlagStore {
  flags: Record<string, boolean>;
  loaded: boolean;
  fetchFlags: () => Promise<void>;
  getFlag: (name: string) => boolean;
}

export const useFlagStore = create<FlagStore>((set, get) => ({
  flags: {},
  loaded: false,
  fetchFlags: async () => {
    // 1. Check localStorage cache
    const cachedTtl = Number(localStorage.getItem(LS_TTL_KEY) ?? 0);
    if (Date.now() < cachedTtl) {
      const cached = localStorage.getItem(LS_KEY);
      if (cached) {
        set({ flags: JSON.parse(cached), loaded: true });
        return;
      }
    }
    // 2. Fetch from backend
    try {
      const res = await fetch('/api/config/flags', {
        credentials: 'include',
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: FeatureFlagsResponse = await res.json();
      localStorage.setItem(LS_KEY, JSON.stringify(data.flags));
      localStorage.setItem(LS_TTL_KEY, String(Date.now() + data.ttl_seconds * 1000));
      set({ flags: data.flags, loaded: true });
    } catch {
      // 3. Env fallback + empty object (fail-closed: all flags false)
      set({ loaded: true });
    }
  },
  getFlag: (name: string) => {
    const envOverride = getEnvFallback(name);
    if (envOverride !== undefined) return envOverride;
    return get().flags[name] ?? false;
  },
}));
```

**`useFeatureFlag.ts`:**

```ts
export function useFeatureFlag(name: string): boolean {
  return useFlagStore(useCallback((s) => s.getFlag(name), [name]));
}
```

**Bootstrap:** `App.tsx` calls `useFlagStore.getState().fetchFlags()` once inside the `gate === 'authed'` effect, before rendering `AppShell`. Flags are available synchronously from localStorage on subsequent loads.

---

## 8. Phase Plan

### Phase 0: Rollback compat marker (PR prerequisite, ~30 LOC)

Add `ADAPTIVE_LAYER_VERSION = 0` constant to `src/lib/adaptiveVersion.ts`. CI will check this exists before merging any adaptive PR. Acts as a documented "last known good" anchor for git revert targeting.

---

### Phase 1 — Foundation (PR: "feat(adaptive): input-mode abstraction + feature flag client")

**Goal:** Zero visible change in prod. Lay the infrastructure every subsequent phase depends on.

**Files touched:**
- `src/nav/InputModeProvider.tsx` — new
- `src/nav/useInputMode.ts` — new  
- `src/lib/featureFlags.ts` — new
- `src/lib/useFeatureFlag.ts` — new
- `src/lib/adaptiveVersion.ts` — new (rollback marker)
- `src/main.tsx` — wrap app in `InputModeProvider`
- `src/App.tsx` — add `fetchFlags()` call in auth effect
- `src/nav/InputModeProvider.test.tsx` — new
- `src/lib/featureFlags.test.ts` — new

**Est LOC:** ~350  
**Risk:** LOW — pure addition, no existing code modified except two lines in `main.tsx` / `App.tsx`  
**Gate:** All existing tests green + new unit tests ≥ 80% coverage on new files

---

### Phase 2 — Token + layout skeleton (PR: "feat(adaptive): responsive layout tokens + AppShell skeleton")

**Goal:** CSS-only layout skeleton for desktop/mobile. No new React components ship to users yet.

**Files touched:**
- `src/brand/tokens.css` — add desktop/mobile breakpoints, `--layout-mode`, `--nav-mode`, `--gutter-page` tokens
- `src/index.css` — `overscroll-behavior: none` on mobile, `:focus-visible` vs `:focus` split for touch
- `src/App.tsx` — `AppShell` sets `data-nav-mode` from `useInputMode().platform`
- `src/nav/BottomDock.tsx` — add `data-hidden` attribute for CSS `display:none` on desktop (keep mounted)

**Est LOC:** ~150  
**Risk:** LOW — token additions are additive; `[data-tv="true"]` blocks untouched  
**Gate:** Visual regression baseline (Playwright screenshot) for TV layout must be identical before/after

---

### Phase 3 — Desktop navigation shell (PR: "feat(adaptive): SideNav + TopBar for desktop")

**Goal:** Side navigation + top bar on `pointer:fine AND hover:hover AND ≥1024px`.

**Files touched:**
- `src/nav/SideNav.tsx` — new (lazy, desktop only)
- `src/nav/TopBar.tsx` — new (lazy, desktop only, search shortcut + user avatar)
- `src/App.tsx` — conditional lazy render of SideNav/TopBar gated by `useFeatureFlag('desktop_side_nav') && platform === 'desktop'`
- `src/nav/SideNav.test.tsx` — new

**Est LOC:** ~420  
**Risk:** MEDIUM — BottomDock stays mounted; norigin focus keys don't conflict but need isolation testing  
**Gate:** `useFeatureFlag('desktop_side_nav')` defaults to `false` in prod; manual enable in staging. TV screenshot regression baseline clean.

---

### Phase 4 — Desktop player: scrubber + mouse controls (PR: "feat(adaptive): desktop player scrubber")

**Goal:** Click-to-seek, drag-scrub, hover-to-expand scrubber bar on desktop/mouse mode.

**Files touched:**
- `src/player/DesktopScrubber.tsx` — new (uses `@use-gesture/react` `useDrag`)
- `src/player/PlayerControls.tsx` — replace static `<div role="progressbar">` with `{isMouse ? <DesktopScrubber> : <TvScrubber>}` (extract existing scrubber into `TvScrubber.tsx`)
- `package.json` — add `@use-gesture/react`
- `src/player/DesktopScrubber.test.tsx` — new

**Est LOC:** ~380  
**Risk:** MEDIUM — `useDrag` pointer-capture must not intercept TV pointer events. Guard: `if (isTV) return null` at top of `DesktopScrubber`.  
**Gate:** `useFeatureFlag('desktop_scrubber')` guards render. Player E2E tests (existing 40 tests) must all pass.

---

### Phase 5 — Mobile player gestures (PR: "feat(adaptive): mobile player gesture layer")

**Goal:** Tap-to-show controls, double-tap seek, swipe-to-seek, swipe-to-volume on touch.

**Files touched:**
- `src/player/PlayerGestureLayer.tsx` — new (lazy, `@use-gesture/react` `useGesture`)
- `src/player/PlayerShell.tsx` — lazy-import `PlayerGestureLayer` gated on `!isTV && isTouch`
- `src/player/PlayerGestureLayer.test.tsx` — new

**Est LOC:** ~320  
**Risk:** MEDIUM-HIGH — double-tap detection needs 300ms window to not conflict with single-tap wake. Must test on real touch device (iOS Safari + Android Chrome).  
**Gate:** `useFeatureFlag('mobile_player_gestures')` in prod. Manual QA on iPhone + Android before flag flip.

---

### Phase 6 — Mobile layout polish (PR: "feat(adaptive): mobile safe-area + touch affordances")

**Goal:** Safe-area insets on route content, touch-target sizing, `:focus-visible` clean-up.

**Files touched:**
- `src/primitives/button.css` — min touch target `44px × 44px` on `pointer:coarse`
- `src/primitives/card.css` — `@container` query for label size on mobile
- Route components (Movies, Series, Live) — `paddingBottom: env(safe-area-inset-bottom)` added
- `src/index.css` — `:focus:not(:focus-visible) { outline: none }` to suppress focus ring after touch tap

**Est LOC:** ~200  
**Risk:** LOW — pure CSS additions, no JS logic  
**Gate:** Lighthouse mobile score on prod ≥ 85. Accessibility audit (axe-core, already in E2E suite) clean.

---

### Phase 7 — Container queries + poster grid (PR: "feat(adaptive): container-query poster grid")

**Goal:** Poster cards use `@container` for self-contained density; remove viewport-width grid hacks.

**Files touched:**
- `src/primitives/card.css` — `container-type: inline-size` + `@container` label rules
- Movies/Series route poster grids — replace fixed `--poster-min-width` media queries with container-aware auto-fill
- `src/index.css` — register `@layer` order if needed for Tailwind 4 compatibility

**Est LOC:** ~180  
**Risk:** LOW — additive CSS; TV `[data-tv="true"]` poster sizing unaffected  
**Gate:** Visual regression baselines for all 3 content grids at 4 viewport widths

---

## 9. Migration Strategy

**Rule:** Every adaptive behavior is behind a feature flag. The flag defaults to `false` in the BE config endpoint. To enable in prod: set the flag in the BE database row for `sv_settings` (key: `feature_flags`) or via a new admin endpoint.

**Input-mode isolation:** Code that changes behavior per input mode MUST be inside `if (useInputMode().isTV)` guards or use `useFeatureFlag()`. Never use `window.matchMedia` directly in component logic — always route through `InputModeProvider` so tests can inject a mock context.

**TV safety net:** CI adds a "TV-mode snapshot" test that runs Playwright with `userAgent` set to `Mozilla/5.0 (Linux; Android 9; AFT)` (Fire TV Silk). This snapshot must stay identical across all PRs that touch player or nav code.

**Rollback:** Any phase can be reverted by flipping its feature flag to `false` in the BE config. No DB migration is needed — flags are a single JSON blob in `sv_settings`. For a hot rollback, `localStorage.removeItem('sv_feature_flags')` on the client is sufficient to re-fetch the disabled flag.

---

## 10. Risks + Mitigations

### Risk 1: norigin + mouse focus conflict (HIGH)

**Problem:** When mouse is used on desktop, `document.activeElement` follows norigin's last spatial focus target. Mouse hover/click on a button that norigin doesn't know about leaves `currentFocusKey` stale. Subsequent d-pad press on Fire TV (if user has both plugged in) fires from the wrong focus root.

**Mitigation:** `InputModeProvider` dispatches `SET_KEYBOARD` on any arrow keydown. `ControlButton` and `MenuItem` add `onClick` that calls `setFocus(focusKey)` — this syncs norigin's internal pointer when mouse clicks a focusable. Add a `useSyncMouseFocus()` hook in Phase 3 that runs `setFocus` on every `focusin` event when `mode === 'mouse'`.

---

### Risk 2: `@use-gesture` pointer events on TV (MEDIUM)

**Problem:** Silk browser fires `pointermove` during d-pad navigation (touch emulation layer). `@use-gesture`'s `useDrag` might activate on false pointer events.

**Mitigation:** `PlayerGestureLayer` and `DesktopScrubber` both have `if (isTV) return null` as their first line. They are never mounted on TV. The gesture bindings never touch the d-pad event path.

---

### Risk 3: Feature flag fetch blocks auth flow (MEDIUM)

**Problem:** `fetchFlags()` is async. If the BE is slow or the endpoint 404s (not yet deployed), the UI could stall or show a flash of wrong layout.

**Mitigation:** `fetchFlags()` has a 3-second `AbortSignal.timeout`. On failure, the store sets `loaded: true` with empty flags — all flags default to `false` (fail-closed). The UI renders with TV/current behavior. Flag fetch is fire-and-forget; it does NOT block `AppShell` render.

---

### Risk 4: Desktop top-nav breaks existing E2E test selectors (MEDIUM)

**Problem:** Playwright E2E tests use `aria-label="Main navigation"` (BottomDock's `<nav>`). If `SideNav` also uses this label, `getByRole('navigation')` becomes ambiguous.

**Mitigation:** `SideNav` uses `aria-label="Site navigation"`. `TopBar` uses `aria-label="Top bar"`. BottomDock keeps `aria-label="Main navigation"` unchanged. E2E tests are explicitly scoped to `page.getByRole('navigation', { name: 'Main navigation' })` in Phase 3 PR.

---

### Risk 5: Bundle budget exceeded on player chunk (LOW-MEDIUM)

**Problem:** Adding `@use-gesture/react` to the player chunk. Current CI gate: player chunk < 200 KB gz.

**Mitigation:** `@use-gesture/react` tree-shakes to ≈6.8 KB gz for `useDrag + useGesture` only. The player chunk currently sits at ~130 KB gz (estimate — HLS.js excluded from initial bundle). After Phase 4+5: ~137 KB gz — well within 200 KB gate. `scripts/check-bundle-budget.js` will catch any regression automatically in CI.

---

## Appendix A: Files to create (new, Phase 1)

```
src/nav/InputModeProvider.tsx
src/nav/useInputMode.ts
src/lib/featureFlags.ts
src/lib/useFeatureFlag.ts
src/lib/adaptiveVersion.ts
src/nav/InputModeProvider.test.tsx
src/lib/featureFlags.test.ts
```

## Appendix B: Files to modify (Phase 1 only)

```
src/main.tsx           — wrap <App> in <InputModeProvider>
src/App.tsx            — fetchFlags() in auth useEffect
```

## Appendix C: Dependency to add

```
@use-gesture/react   ^10.x   (devDependency: no — runtime, player chunk only)
```

No other new runtime dependencies. Tailwind 4 container queries require no plugin — native to the Oxide engine shipped with `@tailwindcss/vite ^4.2.2` (already installed).
