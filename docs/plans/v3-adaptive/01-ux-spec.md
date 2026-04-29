# StreamVault v3 — Adaptive Responsive Layer UX Spec

**Owner:** UX Lead
**Status:** Draft 2026-04-29
**Scope:** Desktop + Mobile support layered on top of the existing Fire TV / TV first experience. Sections reference sibling specs in `docs/ux/` where noted.
**Parent:** `docs/ux/00-ia-navigation.md` (IA contract), `docs/ux/05-player.md` (TV player)
**Must-not-break:** Fire TV d-pad (norigin spatial navigation), tap-rate seek accelerator (PR #116), events-router catchall ordering (PR #54)

---

## 0. Reality anchor — what exists today

| Exists | Does not exist |
|---|---|
| `data-tv="true"` set by UA sniff in `main.tsx` | Input-mode state machine |
| `--gutter-tv` / `--gutter-mobile` CSS tokens | Touch gesture recognizer |
| `--safe-inset`, `clamp()`-based dock tokens | Mouse hover auto-hide timer |
| norigin spatial navigation (d-pad only) | `@media (hover)` / `(pointer)` query usage |
| `prefers-reduced-motion` respected in tokens.css | Bottom tab bar on mobile |
| `PlayerShell` with `position: fixed; inset: 0` + NO `backdrop-filter` | Swipe-to-close player |
| Tap-rate seek accelerator (1s window, 10/30/60s steps) | Drag scrub on timeline |
| `PlayerControls` three-band overlay | Click-outside to hide controls |

**Design consequence:** This spec is additive. Every new behavior is gated by `data-input-mode` and `data-surface` attributes on `:root` set by the JS state machine defined in §2. No existing TV code paths change. The spec is organized so a frontend engineer can implement one surface (Desktop Player) without touching TV or Mobile code.

---

## 1. Breakpoint Strategy

### 1.1 Four-tier definition

| Tier | Width range | Typical device | CSS hook |
|---|---|---|---|
| **TV** | 960px+ with `data-tv="true"` | Fire TV Stick 4K (1920×1080) | `:root[data-tv="true"]` |
| **Desktop** | 1024px–1919px (no `data-tv`) | Laptop / external monitor | `@media (min-width: 1024px)` + `:root:not([data-tv="true"])` |
| **Tablet** | 768px–1023px | iPad, Android tablet, Surface | `@media (min-width: 768px) and (max-width: 1023px)` |
| **Mobile** | 320px–767px | iPhone, Android phone | `@media (max-width: 767px)` |

**TV detection is UA-first, not width-first.** The existing `data-tv="true"` from `main.tsx` correctly identifies Fire TV Silk. A 1080p desktop monitor will not be tagged `data-tv` and will receive Desktop styles even at 1920px. This avoids the false positive where a desktop user at 1080p gets 10-foot typography.

**Rationale for 1024px Desktop floor:** aligns with the industry consensus breakpoint (confirmed by BrowserStack 2026 guide and DisplayPixels 2026 guide). Below 1024px on non-TV hardware, pointer mode switches to tablet/mobile patterns even on a landscape tablet.

### 1.2 Media queries vs container queries — decision matrix

| What adapts | Query type | Rationale |
|---|---|---|
| Navigation shell (dock, top nav, side rail) | **Media query** | Shell layout depends on viewport, not content container |
| Page-level grid column counts | **Media query** | Grid fills the viewport, not a sub-container |
| `PlayerControls` control bar layout | **Container query** on `PlayerShell` | Player can be in a floating PIP window (post-MVP) or embedded in a page |
| Card metadata density (title lines, meta row) | **Container query** on card grid | Cards must adapt when placed in a sidebar vs a full-width grid |
| Toolbar chip overflow (collapse to ▾ popover) | **Container query** on Toolbar | Toolbar width shrinks differently per layout context |

**CSS `@container` is baseline in all 2026 target browsers.** Apply `container-type: inline-size` to `PlayerShell`, `CardGrid`, and `Toolbar`. All player chrome CSS rules use `@container player (...)` syntax.

### 1.3 Exact token overrides per breakpoint

Add to `tokens.css` (new `@layer responsive` block):

```css
/* Desktop (1024-1919, non-TV) */
@media (min-width: 1024px) {
  :root:not([data-tv="true"]) {
    --gutter-content: 32px;
    --poster-min-width: 160px;
    --dock-height: 64px;
    --nav-mode: "top"; /* consumed by JS to switch nav component */
    --type-body: 16px;    /* body copy drops from TV 20px to web 16px */
    --type-title: 20px;
    --type-title-lg: 28px;
  }
}

/* Tablet (768-1023) */
@media (min-width: 768px) and (max-width: 1023px) {
  :root {
    --gutter-content: 24px;
    --poster-min-width: 130px;
    --dock-height: 60px;
    --nav-mode: "bottom";
  }
}

/* Mobile (320-767) */
@media (max-width: 767px) {
  :root {
    --gutter-content: 16px;
    --poster-min-width: 110px;
    --dock-height: 56px;
    --nav-mode: "bottom";
    --type-body: 14px;
    --type-title: 17px;
    --type-title-lg: 22px;
  }
}
```

---

## 2. Input-Mode Detection — State Machine

### 2.1 Four input modes

| Mode | Token value | Active when |
|---|---|---|
| `dpad` | `"dpad"` | `data-tv="true"` (Fire TV UA sniff) |
| `keyboard` | `"keyboard"` | Non-TV + any `keydown` with `key` in keyboard set (Tab, Arrow*, Enter, Space) |
| `mouse` | `"mouse"` | `mousemove` event fired (not touch-emulated) |
| `touch` | `"touch"` | `touchstart` event fired |

### 2.2 State machine transitions

```
                  ┌─────────────────────────────────────────────┐
                  │                                             │
   UA=FireTV ──► DPAD ◄──────────────────────────────────────── │
                  │  (once in dpad, never leaves — Fire TV only) │
                  │                                             │
  ┌──────┐  mousemove   ┌──────┐  touchstart  ┌───────┐        │
  │      │ ──────────► │      │ ──────────── │       │        │
  │ KEY  │             │MOUSE │              │ TOUCH │        │
  │      │ ◄────────── │      │ ◄─────────── │       │        │
  └──────┘  keydown    └──────┘  mousemove   └───────┘        │
      ▲                    │                     │             │
      └──── keydown ───────┘─────────────────────┘             │
                                                               │
                  └─────────────────────────────────────────────┘
```

**Key rules:**
- `dpad` mode is terminal — UA-sniffed Fire TV never leaves it
- `mouse` → `touch` on `touchstart` (user picked up stylus or put phone flat)
- `touch` → `mouse` on `mousemove` with `movementX + movementY > 4px` (distinguishes real mouse from touch-emulated mousemove)
- `keyboard` → `mouse` on `mousemove` (keyboard user grabbed mouse)
- Any → `keyboard` on `keydown` with `Tab` | `Arrow*` | `Enter` | `Escape` | Space | `f` | `m` (player shortcuts)
- Debounce: transitions fire at most once per 100ms to avoid thrash on hybrid devices

### 2.3 Implementation

```typescript
// src/nav/inputMode.ts  (new file)

export type InputMode = "dpad" | "keyboard" | "mouse" | "touch";

let current: InputMode = document.documentElement.dataset.tv === "true"
  ? "dpad"
  : "mouse";

const KEYBOARD_KEYS = new Set([
  "Tab","ArrowUp","ArrowDown","ArrowLeft","ArrowRight",
  "Enter"," ","Escape","f","m","k","j","l",
]);

function set(mode: InputMode) {
  if (current === "dpad") return; // terminal
  if (current === mode) return;
  current = mode;
  document.documentElement.dataset.inputMode = mode;
  window.dispatchEvent(new CustomEvent("sv:inputmode", { detail: mode }));
}

let last = 0;
function throttled(fn: () => void) {
  const now = Date.now();
  if (now - last < 100) return;
  last = now;
  fn();
}

window.addEventListener("touchstart", () => throttled(() => set("touch")), { passive: true });
window.addEventListener("mousemove", (e) => {
  if (Math.abs(e.movementX) + Math.abs(e.movementY) < 4) return;
  throttled(() => set("mouse"));
}, { passive: true });
window.addEventListener("keydown", (e) => {
  if (KEYBOARD_KEYS.has(e.key)) throttled(() => set("keyboard"));
}, { passive: true });

export function getInputMode() { return current; }
export function useInputMode() { /* Zustand/useSyncExternalStore wrapper */ }
```

`data-input-mode` on `:root` lets CSS respond without JS:

```css
/* Show hover chrome only in mouse mode */
:root[data-input-mode="mouse"] .player-hover-chrome { display: flex; }
:root:not([data-input-mode="mouse"]) .player-hover-chrome { display: none; }

/* Large tap targets in touch mode */
:root[data-input-mode="touch"] .control-btn { min-height: 48px; min-width: 48px; }
```

### 2.4 Focus-visible strategy

In `keyboard` mode, apply native `:focus-visible` ring. In `mouse` mode, suppress `:focus-visible` on click-focused elements. In `touch` mode, show a momentary press ring (250ms fade). In `dpad` mode, use existing norigin focus ring (`--focus-ring-shadow`).

```css
/* Touch press ring */
:root[data-input-mode="touch"] button:focus {
  outline: 2px solid var(--accent-copper);
  outline-offset: 2px;
  animation: sv-press-ring 250ms ease-out forwards;
}
@keyframes sv-press-ring {
  from { opacity: 1; }
  to   { opacity: 0; }
}
```

---

## 3. Player Gesture Grammar

### 3.1 Gesture priority and conflict resolution

Gestures are evaluated in order: pinch > double-tap > long-press > drag-horizontal > drag-vertical > single-tap. A gesture is "claimed" by the first recognizer whose threshold is met; all other recognizers release their tracking state.

### 3.2 Gesture table — complete specification

#### G1. Single Tap — Toggle Controls Visibility

| Attribute | Value |
|---|---|
| **Input** | 1 touch contact, lifted within 300ms, total movement < 10px |
| **Detection** | `touchend` with `changedTouches.length === 1` + duration check |
| **Action (controls hidden)** | Show controls. Start 3s auto-hide timer. Do NOT trigger play/pause. |
| **Action (controls visible)** | Hide controls immediately (300ms fade). |
| **Action (on control bar)** | Pass through to button; do not toggle visibility |
| **Visual feedback** | None (controls appear/disappear) |
| **Accessibility alt** | Keyboard: any key wakes controls. Screen reader: controls always visible |
| **TV coordination** | TV uses same "first press wakes" pattern (05-player §4.3). Identical semantic. |

**Rationale:** Single-tap is the primary "I want to see the controls" signal on mobile. Matching YouTube/Netflix behavior (tap = toggle chrome, not play/pause) avoids accidental pauses. Play/pause on tap is strictly double-tap zone left/right behavior — not center tap.

---

#### G2. Double-Tap Left Zone — Seek Back

| Attribute | Value |
|---|---|
| **Input** | 2 taps in the **left 35%** of video, second tap within 400ms of first, movement between taps < 12px |
| **Detection** | Custom `DoubleTapRecognizer`: store `lastTap` timestamp + position per touch; on second `touchend` check delta-time ≤ 400ms, delta-px ≤ 12, x-position ≤ `videoWidth * 0.35` |
| **Seek amount** | **Default: 10s back.** Feeds the same tap-rate accelerator (PR #116): if 3+ taps in last 1s → 30s; 6+ → 60s. Tap-window resets on direction change. |
| **Visual feedback** | Left-zone ripple: two `‹‹` chevrons, copper color, radial expand + fade over 600ms centered at tap position. Time delta badge: `«10s` / `«30s` / `«60s` appears above scrubber, white on `rgba(0,0,0,0.6)` pill, fades 1.2s. |
| **Disabled on Live** | Yes — double-tap on Live shows brief "Live TV — can't seek" toast (2s). |
| **Accessibility alt** | Keyboard `j` or `ArrowLeft` (standard YouTube convention) seeks -10s. Feeds same tap-rate window. |
| **ARIA** | `aria-live="polite"` region announces `"Seek back 10 seconds — 1:34:22"` |

---

#### G3. Double-Tap Right Zone — Seek Forward

| Attribute | Value |
|---|---|
| **Input** | 2 taps in the **right 35%** of video within 400ms, movement < 12px |
| **Seek amount** | Same tap-rate accelerator: 10s → 30s → 60s |
| **Visual feedback** | Right-zone ripple: `››` chevrons, same animation mirrored. Badge: `»10s` etc. |
| **Disabled on Live** | Yes |
| **Accessibility alt** | Keyboard `l` or `ArrowRight` seeks +10s (YouTube convention) |
| **ARIA** | `aria-live="polite"`: `"Seek forward 10 seconds — 1:34:22"` |

**Center 30% zone (35%–65%):** double-tap is a no-op for seek. Prevents accidental seeks when user taps center to pause/play or reveal controls. A center double-tap within 400ms shows controls (treated as two single taps).

---

#### G4. Horizontal Drag — Timeline Scrub

| Attribute | Value |
|---|---|
| **Input** | Touch drag starting in the video area (not on control bar), horizontal movement ≥ 20px AND `abs(deltaX) > abs(deltaY) * 1.5` (angle < ~34°) within first 150ms |
| **Claim distance** | 20px horizontal displacement claims the gesture; vertical gesture recognizers release |
| **Drag ratio (standard)** | 1% of video width = 1% of video duration. So on a 44-minute video at 375px wide: each pixel ≈ `(44*60) / 375 ≈ 7.0s/px`. **Cap: 120s/px max.** |
| **Precision mode** | When drag begins in the lower 20% of the video frame, switch to **1/3 speed**: 1px = 2.3s on same example. Matches YouTube "precision seek" behavior (2021+ Android). |
| **Visual feedback** | Scrubber bar becomes visible if hidden. Thumb indicator enlarges from 12px to 20px radius. Ghost timestamp pill follows the thumb: `1:34:22` in `rgba(0,0,0,0.72)` pill, 8px above thumb. If drag-seeking backward past a chapter or episode boundary, pulse the thumb. |
| **Commit** | `touchend`: seek to the ghost position. Frame-accurate on VOD. |
| **Cancel** | Fling with velocity > 800px/s in Y direction cancels seek, returns to `currentTime`. Rationale: user may swipe-close the player. |
| **Disabled on Live** | Yes. Horizontal drag on Live does nothing (no seek bar shown). |
| **Accessibility alt** | Keyboard `ArrowLeft` / `ArrowRight` feeds tap-rate accelerator (see G2/G3). Mouse: drag the scrubber thumb directly (dedicated `<input type="range">` in Desktop mode). |
| **ARIA** | `role="slider"` on scrubber, `aria-valuenow` updated continuously during drag, `aria-label="Video progress"` |

---

#### G5. Vertical Drag Right Edge — Volume

| Attribute | Value |
|---|---|
| **Input** | Drag starting in the **right 20%** of screen, vertical movement ≥ 15px AND `abs(deltaY) > abs(deltaX) * 1.5` |
| **Action** | Swipe up → volume up; swipe down → volume down. 1px = `0.5%` volume change. Clamped [0, 1]. |
| **Visual feedback** | Right-edge volume bar: 40px wide, full height, copper fill from bottom, `rgba(0,0,0,0.6)` background. Percentage label at current level. Fades 1.5s after drag ends. |
| **Default state** | **Opt-in only.** Hidden behind Settings > Playback > "Swipe gestures" toggle (default OFF). Rationale: accidental volume change on right-edge tap is a top complaint in VLC/MX Player reviews. Users who want it love it; users who don't are confused by it. |
| **Accessibility alt** | Keyboard `m` toggles mute. Up/Down in volume popover (d-pad + keyboard). |

---

#### G6. Vertical Drag Left Edge — Brightness

| Attribute | Value |
|---|---|
| **Input** | Drag starting in the **left 20%** of screen, vertical pattern same as G5 |
| **Action** | Swipe up → brightness up; swipe down → brightness down. Implemented as CSS `filter: brightness(N)` on the `<video>` element. Range: 0.3 – 1.5. 1px = 0.01 brightness unit. |
| **Visual feedback** | Left-edge brightness bar: same treatment as volume bar, but uses a sun `☀` icon at top |
| **Default state** | **Opt-in only**, same toggle as G5. They are a pair. |
| **Scope** | In-app brightness only (CSS filter). Cannot control device display brightness from a web page without OS permission. This is by design — avoids the permission prompt and matches Plex/MX Player web behavior. |
| **Accessibility alt** | No keyboard shortcut (brightness is a convenience feature, not accessibility-critical). Describe limitation in Settings panel. |

---

#### G7. Long-Press — 2x Fast Forward (Hold-to-Speed)

| Attribute | Value |
|---|---|
| **Input** | Single touch held for **≥ 500ms** without movement > 8px. Released = return to 1x. |
| **Detection** | `touchstart` starts a 500ms `setTimeout`. On `touchmove > 8px` or `touchend < 500ms`, cancel the timer. On timer fire: activate 2x mode. |
| **Action** | Set `video.playbackRate = 2.0`. Show badge: `2×` — copper text, `rgba(0,0,0,0.72)` pill, top-center of video. |
| **Release** | `touchend` or `touchcancel` → `video.playbackRate = 1.0`, badge fades 400ms. |
| **Disabled on Live** | Yes — `video.playbackRate` has no effect on live HLS edge. Show "Live TV" badge instead. |
| **TV coordination** | TV uses tap-rate acceleration (PR #116) — NOT a hold-timer. This is the mobile-exclusive hold-timer (safe because mobile doesn't emit hold as auto-tap pairs the way Silk does). The two systems are independent and do not share code. |
| **Accessibility alt** | Keyboard `>` or `Shift+.` cycles playback rate: 1x → 1.25x → 1.5x → 2x → 1x. Announced via `aria-live`. |
| **ARIA** | `aria-live="assertive"` announces `"2x speed"` on activation, `"Normal speed"` on release. |

---

#### G8. Pinch — Fullscreen Toggle (Mobile) / No-op (Others)

| Attribute | Value |
|---|---|
| **Input** | Two touch contacts, `hypot(dx, dy)` change ≥ 30px from initial spread |
| **Action (mobile, not already fullscreen)** | Pinch-out → `document.documentElement.requestFullscreen()`. Visual: brief scale-expand animation on player (150ms, `cubic-bezier(0.2, 0, 0.2, 1)`). |
| **Action (mobile, already fullscreen)** | Pinch-in → `document.exitFullscreen()`. |
| **Action (desktop/tablet)** | No-op. Pinch on desktop likely means browser zoom — do not intercept `pinch` if `e.ctrlKey` is true (that is the browser zoom gesture). |
| **Accessibility alt** | Button `[⤢]` in bottom-right of controls, keyboard `f` toggles fullscreen |
| **ARIA** | `aria-label="Enter full screen"` / `"Exit full screen"` toggling on button |

---

#### G9. Swipe Down — Close Fullscreen (Mobile Only)

| Attribute | Value |
|---|---|
| **Input** | Single touch, vertical drag downward ≥ 80px, velocity ≥ 300px/s, starting in the **top 30%** of the player, `abs(deltaY) > abs(deltaX) * 2` |
| **Action** | Exit fullscreen if in fullscreen. Otherwise: close player overlay (equivalent to Back). Animate: player slides down with `cubic-bezier(0.4, 0, 1, 1)` over 280ms, fades to 0. |
| **Cancel threshold** | If drag velocity < 300px/s at `touchend`, snap back with `cubic-bezier(0, 0, 0.2, 1)` over 200ms. |
| **Accessibility alt** | Back button in player chrome. Keyboard `Escape`. |

---

#### G10. Two-Finger Tap — Seek to Next Chapter (Bonus, Explicit Feature)

| Attribute | Value |
|---|---|
| **Input** | 2 simultaneous touch contacts, both lifted within 300ms, no movement > 8px |
| **Action** | Not implemented in MVP (no chapter marker data from backend — per `05-player.md §13`). Reserved gesture slot. Do NOT use this slot for anything else. |

---

### 3.3 Gesture recognizer implementation pattern

All gesture logic lives in `src/player/usePlayerGestures.ts` (new file). It attaches to the `PlayerShell` div via refs, not via React's synthetic event system (for `passive: true` and cancellation control):

```typescript
// Pattern — horizontal drag vs vertical drag disambiguation
const CLAIM_PX = 20;        // G4: horizontal drag claim threshold
const CLAIM_RATIO = 1.5;    // abs(deltaX) / abs(deltaY) for horizontal claim
const CLAIM_MS = 150;       // time window to measure angle
const LONG_PRESS_MS = 500;  // G7
const DOUBLE_TAP_MS = 400;  // G2/G3
const DOUBLE_TAP_PX = 12;   // max movement between taps
const SWIPE_DOWN_PX = 80;   // G9 vertical distance
const SWIPE_DOWN_VEL = 300; // G9 px/s
const PINCH_MIN_PX = 30;    // G8 spread change
```

### 3.4 Gesture interaction with existing TV code

The gesture hook is conditionally mounted:

```typescript
// Only mount on non-TV touch/mouse surfaces
const inputMode = useInputMode();
const gesturesEnabled = inputMode === "touch"; // only for touch
```

The TV `PlayerControls` keyboard handlers remain untouched. The gesture hook is **additive**, not a replacement. Both can be mounted simultaneously (hybrid laptop-with-touch) but the TV branch (`data-tv="true"`) always wins and the gesture hook is not mounted there at all.

---

## 4. Player Chrome Layout Per Surface

### 4.1 TV — existing (no change)

Three-band overlay as specified in `docs/ux/05-player.md`. Auto-hide 3s. D-pad focus flow. Tap-rate accelerator. No changes from this spec.

### 4.2 Desktop — Mouse + Keyboard

**Layout:** Same three-band overlay as TV (top bar, scrubber, control bar) but with:

- **Hover-to-show:** Controls appear on `mousemove` inside the player. Fade in: 200ms `cubic-bezier(0.2, 0, 0.2, 1)`. Auto-hide after **2.5s** of no movement (shorter than TV's 3s — mouse is faster to recall). `mouseleave` on the player immediately hides controls (300ms fade).
- **Click-to-pause:** Single click anywhere on the video **not on a control** toggles pause/play (standard desktop behavior). Double-click toggles fullscreen.
- **Scrubber is interactive:** Desktop scrubber is a proper `<input type="range">` styled to match the existing design, not just a visual indicator. The thumb is 16px diameter, grows to 20px on hover/focus.
- **Tooltip on hover over time:** Hovering the scrubber shows a timestamp tooltip above the thumb: `[thumbnail preview not available] 1:34:22` in a `rgba(0,0,0,0.85)` pill.
- **Control bar:** Same 9 buttons. Icon sizes shrink: 24px → 20px. Font size: `--type-caption` (14px). Buttons get `title="..."` tooltips with keyboard shortcut: e.g. `title="Play / Pause (Space)"`.
- **Volume:** Mouse wheel on video adjusts volume: up = +5%, down = -5%. Visual: right-edge volume indicator appears for 1.5s.
- **Keyboard shortcuts (complete list):**

| Key | Action |
|---|---|
| `Space` / `k` | Play/Pause |
| `f` | Toggle fullscreen |
| `m` | Toggle mute |
| `ArrowLeft` / `j` | Seek -10s (feeds tap-rate window) |
| `ArrowRight` / `l` | Seek +10s (feeds tap-rate window) |
| `ArrowUp` | Volume +5% |
| `ArrowDown` | Volume -5% |
| `>` or `Shift+.` | Cycle playback rate: 1x → 1.25x → 1.5x → 2x → 1x |
| `<` or `Shift+,` | Cycle rate backward |
| `c` | Toggle subtitles on/off |
| `Escape` | Close player |
| `0`–`9` | Jump to 0%–90% of video duration |
| `[` | Previous episode/channel |
| `]` | Next episode/channel |

All shortcuts are **inactive when focus is inside a text input** (e.g. Search bar). The shortcuts handler checks `document.activeElement.tagName`.

### 4.3 Mobile — Three-State Visibility Model

Controls exist in three states:

```
STATE 1: HIDDEN
  - Black video fills screen
  - Tap anywhere → STATE 2

STATE 2: VISIBLE (3s auto-hide timer running)
  - Top bar + control bar + scrubber shown
  - Any interaction resets timer to 3s
  - Timer expires → STATE 1 (fade 300ms)
  - Tap on control = action + timer reset
  - Tap on video (not control) → STATE 1

STATE 3: EXPANDED (popover open — audio/subs/quality)
  - Bottom sheet slides up from bottom of screen (native-feeling)
  - Covers lower 50% of screen
  - Tap outside sheet → STATE 2
  - Select option → commit + STATE 1 after 1s
  - Swipe down on sheet → STATE 2
```

**Mobile control bar differences from TV:**

- Buttons are larger: `min-height: 48px; min-width: 48px` (Apple HIG touch target minimum)
- Icon size: 28px (larger than TV's 20px for touch accuracy)
- Volume button: shows current volume as `🔉 72%` inline text (no vertical slider popover — vertical slider is awkward on mobile). Tap toggles mute. Long-press opens bottom sheet with full slider.
- Audio/Subs/Quality: open as **bottom sheets** (slide up 280ms `cubic-bezier(0, 0, 0.2, 1)`) rather than upward popovers. Height: auto up to 60% of screen height. Scrollable with `overflow-y: auto`.
- **Fullscreen-by-default:** player always opens fullscreen on mobile using `requestFullscreen()` on player mount. If permission denied, the `position: fixed; inset: 0` fallback still covers the viewport.
- **Status bar treatment:** use `<meta name="theme-color" content="#000000">` while player is open.

**Compact landscape on mobile:**
When `window.innerHeight < 500` (landscape phone), auto-hide becomes 2s. Top bar font drops to `--type-caption` (14px). Scrubber height reduces to 2px. Control icons stay 28px.

---

## 5. Navigation / Layout Per Surface

### 5.1 TV (no change)

Bottom dock `BottomDock.tsx`. Fixed, floating pill, `z-index: 100`. D-pad spatial navigation. See `00-ia §2.1`.

### 5.2 Desktop

**Top navigation bar** replaces the bottom dock:

```
┌──────────────────────────────────────────────────────────────┐
│  [SV logo]  [Movies] [Series] [Live] [Search ___________]  [⚙]│
│             ^^^^^^^^^^^^^^^^^^^^^^^^                         │
│             active tab underlined copper 2px + copper text  │
└──────────────────────────────────────────────────────────────┘
```

- Height: 56px. `position: sticky; top: 0; z-index: 100`.
- Background: `rgba(18,16,14,0.92)` + `backdrop-filter: blur(20px)` + `border-bottom: 1px solid rgba(255,255,255,0.06)`.
- Inline search expands to 240px on focus (animation: 200ms `ease-out`), collapses to 40px icon on blur if empty.
- Settings moves to an icon button right-aligned.
- Favorites: accessible from avatar/settings dropdown, not inline nav (too many items for top nav).
- `tabindex` sequence: logo → Movies → Series → Live → Search → Settings.
- Active indicator: 2px bottom border `--accent-copper`, font-weight 600.

**Content layout:**

- Max-width container: `1400px`, `margin: 0 auto`, `padding: 0 var(--gutter-content)`.
- PosterGrid: CSS `grid`, `grid-template-columns: repeat(auto-fill, minmax(var(--poster-min-width), 1fr))`. At Desktop: yields ~7–8 columns at 1280px.
- No virtualization (Virtuoso) on Desktop — standard CSS grid with native scroll is sufficient and simpler for mouse interactions.

**LanguageRail:** stays as a horizontal chip row below the top nav. Same component; no layout change needed.

### 5.3 Tablet

Bottom tab bar (same 5 tabs as TV but styled for touch):

- Height: 60px. Tab min-width: 64px.
- Icons: 24px. Labels visible (not icon-only).
- `safe-area-inset-bottom` padding applied.
- Content: same as Desktop grid but with `--gutter-content: 24px`.
- Side rail: not used. Keep bottom tab bar.

### 5.4 Mobile

Bottom tab bar, 56px height, 5 tabs:

- Icon-only on screens < 360px wide (very narrow phones — Samsung A05). Labels shown ≥ 360px.
- `safe-area-inset-bottom` padding on the bar itself (`padding-bottom: env(safe-area-inset-bottom, 8px)`).
- Tab tap target: full bar height + 8px above (extended via `::before` pseudo-element) — minimum 48px.

**Content layout mobile:**

- Single-column feed on < 375px. Two-column grid ≥ 375px.
- PosterGrid: `grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))` → ~3 columns at 375px.
- Cards: aspect ratio 2:3 (poster), title below, 1 line truncated.
- Top bar (LanguageRail + Toolbar): sticky, collapses to 2 lines: language chips row, then sort row. Total height ≤ 80px.

**Navigation changes mobile:**

- Back gesture: native browser back. No custom implementation needed (React Router handles it).
- Series detail page: stacks vertically (poster → metadata → seasons chips → episode list).

---

## 6. Page-by-Page Treatment

### 6.1 Live — `/live`

| Surface | Layout changes |
|---|---|
| **TV** | No change. SplitGuide (channel list + EPG panel). |
| **Desktop** | SplitGuide: left column 360px fixed, right EPG panel fills. Hover on channel row shows Play button. |
| **Tablet** | SplitGuide: left column 260px, EPG collapses to "Now / Next" columns (2 columns). |
| **Mobile** | Vertical list only. EPG panel hidden. Tap channel → player opens fullscreen. "Now Playing" chip inline with channel name. |

**Player on Live — mobile:** no scrubber, `● LIVE` badge, swipe-down closes. Tap reveals controls with 3s auto-hide.

### 6.2 Movies — `/movies`

| Surface | Changes |
|---|---|
| **TV** | No change. VirtuosoGrid. |
| **Desktop** | Standard CSS grid (no Virtuoso). ResumeHero renders as a 16:9 banner, full width, above LanguageRail. Card hover: scale 1.04 + play overlay icon (200ms `ease-out`). |
| **Tablet** | Same as Desktop grid but 3–4 columns. |
| **Mobile** | 2-column poster grid. ResumeHero: compact strip (height 80px) above language rail. Pull-to-refresh supported (native `overscroll-behavior: contain`). |

**MovieDetailSheet (desktop):** renders as a right-side panel (400px wide) sliding in from the right on card click (instead of a bottom sheet). On mobile, keep bottom sheet behavior.

### 6.3 Series — `/series` and `/series/:id`

| Surface | Changes |
|---|---|
| **TV** | No change. |
| **Desktop** | Series grid same as Movies. Detail page: two-column layout (left: poster + metadata, right: seasons + episodes). |
| **Tablet** | Detail: stacked (poster + meta on top, seasons below). |
| **Mobile** | Detail: full-width poster, collapsible synopsis (2 lines + "more"), horizontal season chips scroll, episode list. |

**Episode row on mobile:** compact — thumbnail (56px × 80px, 2:3 ratio) + title + duration + progress bar. Tap → player fullscreen.

### 6.4 Search — `/search`

| Surface | Changes |
|---|---|
| **TV** | No change. Existing `SearchInput` with d-pad. |
| **Desktop** | Inline search in top nav expands. Results in 3-column grid with type sections (Live / Movies / Series). |
| **Mobile** | Full-screen search overlay: text input at top, virtual keyboard visible (scroll content behind). Results as vertical list (not grid). |

**Mobile search overlay:**
- Opens with 280ms slide-up
- Input auto-focused on open (triggers keyboard)
- `inputmode="search"` + `enterkeyhint="search"` on `<input>`
- Clear (×) button visible when query ≥ 1 char
- Back button or swipe-down closes overlay

### 6.5 Favorites — `/favorites`

Same grid layout as Movies. No layout-specific changes beyond the breakpoint tokens. Accessible from Settings on all surfaces. On Desktop, also accessible from a heart icon in the top nav overflow menu (⋯).

### 6.6 Settings — `/settings`

| Surface | Changes |
|---|---|
| **TV** | No change. Existing list layout. |
| **Desktop** | Two-column: left sidebar (categories), right content pane. Width: 280px + flex fill. |
| **Mobile** | Single column, full-width. Sections are accordions (collapsed by default). |

**New Settings section: Playback (all surfaces):**

```
Playback preferences
─────────────────────
[■] Swipe gestures (volume/brightness)  [OFF ▸]
[ ] Autoplay next episode               [ON ▸]
[ ] Default playback speed              [1x ▸]
[ ] Preferred audio language            [Telugu ▸]
```

### 6.7 Player — full spec addendum

Per surface, the full gesture grammar (§3), chrome layout (§4), and visibility model (§4.3) apply. Key invariants across all non-TV surfaces:

- `PlayerShell` keeps `position: fixed; inset: 0; z-index: 1000`. No backdrop-filter on the shell itself (preserved from TV constraint).
- Fullscreen API: `requestFullscreen()` on `PlayerShell` element, not `document.documentElement`. Avoids browser chrome on some platforms.
- History sentinel from `PlayerProvider` still fires on open — mobile Back gesture will close the player.
- On `fullscreenchange` event: if user exits fullscreen via Escape or OS back, call `close()` from `usePlayerStore()`.

---

## 7. Accessibility

### 7.1 Focus visible — per mode

| Mode | Focus indicator |
|---|---|
| `dpad` | Copper ring: `box-shadow: 0 0 0 2px #C87941, 0 0 24px 4px rgba(200,121,65,0.35)` |
| `keyboard` | Native `:focus-visible` + copper ring (same shadow) |
| `mouse` | `:focus-visible` suppressed on `:not(:focus-visible)` (CSS4) |
| `touch` | Press ring: 2px `#C87941`, animated fade 250ms |

All focusable elements have `outline: none` replaced by `box-shadow` (avoids rendering artifacts on `border-radius` elements). Minimum focus indicator area: 3px × perimeter (WCAG 2.2 AA SC 2.4.11 "Focus Appearance").

### 7.2 Keyboard alternatives for all gestures

| Gesture | Keyboard equivalent |
|---|---|
| G1 single tap (show/hide controls) | Any key while player focused |
| G2 double-tap left (seek back) | `j` or `ArrowLeft` |
| G3 double-tap right (seek forward) | `l` or `ArrowRight` |
| G4 horizontal drag (scrub) | `ArrowLeft` / `ArrowRight` (feeds tap-rate) or click on `<input type="range">` scrubber |
| G5 volume drag | `ArrowUp` / `ArrowDown` in player context |
| G6 brightness drag | No keyboard equivalent — brightness is a convenience-only feature |
| G7 long-press 2x speed | `>` cycles speed |
| G8 pinch (fullscreen) | `f` |
| G9 swipe-down (close) | `Escape` |

### 7.3 ARIA roles — player

```html
<div role="application" aria-label="Video player — {title}" data-testid="player-shell">
  <video aria-hidden="true" /> <!-- screen readers use live region, not video -->
  
  <!-- Screen reader only live regions -->
  <div aria-live="polite" aria-atomic="false" class="sr-only" id="player-status">
    <!-- Updated on: play/pause, seek, volume, track change -->
  </div>
  <div aria-live="assertive" aria-atomic="true" class="sr-only" id="player-alert">
    <!-- Updated on: buffering, error, speed change -->
  </div>
  
  <!-- Top bar -->
  <header role="banner">
    <button aria-label="Back to browse">←</button>
    <span aria-label="Now playing: {title}, Season 2 Episode 5">…</span>
    <time datetime="PT1H34M22S" aria-label="Current time: 1 hour 34 minutes 22 seconds">1:34:22</time>
  </header>
  
  <!-- Scrubber -->
  <input type="range"
    role="slider"
    aria-label="Video progress"
    aria-valuenow="{Math.round(currentTime)}"
    aria-valuemin="0"
    aria-valuemax="{Math.round(duration)}"
    aria-valuetext="{formatTime(currentTime)} of {formatTime(duration)}"
  />
  
  <!-- Control bar -->
  <div role="toolbar" aria-label="Playback controls">
    <button aria-label="Play" aria-pressed="false">⏯</button>
    <!-- ... -->
    <button aria-label="Audio track: Telugu (selected)" aria-haspopup="listbox">🎧</button>
    
    <!-- Audio popover -->
    <ul role="listbox" aria-label="Audio tracks" aria-expanded="true">
      <li role="option" aria-selected="true">Telugu</li>
      <li role="option" aria-selected="false">Hindi</li>
    </ul>
  </div>
</div>
```

**Screen reader announcement script for seek:**

```typescript
function announceSeek(currentTime: number, duration: number, direction: "back" | "forward", delta: number) {
  statusRegion.textContent = `Seek ${direction} ${delta} seconds — ${formatTimeVerbose(currentTime)} of ${formatTimeVerbose(duration)}`;
}
// formatTimeVerbose: "1 hour 34 minutes 22 seconds" (not "1:34:22")
```

### 7.4 `prefers-reduced-motion`

All animations that are **decorative** (ripple, scale hover, slide-in popovers, seek badge fade) are suppressed:

```css
@media (prefers-reduced-motion: reduce) {
  .gesture-ripple { display: none; }
  .player-controls { transition: opacity 0ms; }
  .bottom-sheet { transition: transform 0ms; }
  .top-nav-search { transition: width 0ms; }
  .card-hover-overlay { transition: opacity 0ms; transform: none; }
}
```

Animations that convey **state** (error overlay appearing, loading spinner) persist in reduced-motion but swap to a pulse instead of a spin (already in `PlayerShell.tsx`).

### 7.5 Color contrast — WCAG 2.2 AA

| Pair | Ratio | Passes |
|---|---|---|
| `#EDE4D3` on `#12100E` (text-primary on bg-base) | 14.8:1 | AAA |
| `rgba(237,228,211,0.8)` on `#12100E` (text-secondary) | ~9.8:1 | AAA |
| `#C87941` on `#12100E` (copper on dark) | 4.7:1 | AA |
| White text on `rgba(0,0,0,0.6)` overlay | Approx 11:1 | AAA |

**New surfaces to verify:** `rgba(18,16,14,0.72)` toolbar bg — text-primary on this composited over video = must be verified against actual video content. Recommendation: add a text-shadow `0 1px 3px rgba(0,0,0,0.8)` to all player overlay text.

### 7.6 Screen reader — navigation

Every route announces its title on mount via `document.title` update: `"Live — StreamVault"`, `"Movies — StreamVault"`, etc. Player open: `"Now playing: {title} — StreamVault"`. Player close: restores the route title.

`<nav>` landmark with `aria-label="Main navigation"` already exists on `BottomDock`. Desktop top nav needs same `aria-label`.

---

## 8. Animation Timings

All timings are CSS custom properties so `prefers-reduced-motion` overrides them in one place.

### 8.1 Existing tokens (reference)

| Token | Value | Use |
|---|---|---|
| `--motion-focus` | `150ms ease-out` | Focus ring, button hover, tab active |
| `--motion-page` | `250ms ease-out` | Route transitions |
| `--motion-dock` | `400ms ease-out` | Dock opacity transitions |

### 8.2 New tokens for this spec

Add to `tokens.css`:

```css
/* Player chrome */
--motion-player-show:   200ms cubic-bezier(0.2, 0, 0.2, 1);   /* controls fade in */
--motion-player-hide:   300ms cubic-bezier(0.4, 0, 1, 1);     /* controls fade out */
--motion-player-close:  280ms cubic-bezier(0.4, 0, 1, 1);     /* swipe-close */
--motion-player-open:   220ms cubic-bezier(0, 0, 0.2, 1);     /* player mount */

/* Gesture feedback */
--motion-ripple:        600ms cubic-bezier(0, 0, 0.2, 1);     /* seek zone ripple */
--motion-badge-show:    120ms ease-out;                        /* seek badge appear */
--motion-badge-hide:   1200ms ease-in;                         /* seek badge fade */
--motion-speed-badge:   150ms ease-out;                        /* 2x badge appear */

/* Bottom sheet */
--motion-sheet-in:      280ms cubic-bezier(0, 0, 0.2, 1);     /* sheet slide up */
--motion-sheet-out:     220ms cubic-bezier(0.4, 0, 1, 1);     /* sheet slide down */

/* Top nav */
--motion-nav-search:    200ms ease-out;                        /* search expand */
--motion-card-hover:    200ms ease-out;                        /* card scale on hover */

/* Scrubber thumb */
--motion-scrub-thumb:   150ms ease-out;                        /* thumb size on hover */
```

### 8.3 Easing curve rationale

| Curve | Token uses | Principle |
|---|---|---|
| `cubic-bezier(0.2, 0, 0.2, 1)` (standard decelerate) | Player show, sheet-in, ripple | "Things arriving" feel heavy at start, ease in |
| `cubic-bezier(0.4, 0, 1, 1)` (standard accelerate) | Player hide, sheet-out, player-close | "Things leaving" feel responsive, accelerate out |
| `cubic-bezier(0, 0, 0.2, 1)` (sharp decelerate) | Player open | Matches Android Material "container transform" |
| `ease-out` | Focus, nav, card hover, badges | Simple, fast-enough for micro-interactions |

These curves align with Material Design 3's "standard", "decelerate", and "accelerate" easing functions (m3.material.io/foundations/interaction/gestures).

### 8.4 Animation budget — Fire TV constraint

On TV (`data-tv="true"`), all new animations from this spec are disabled at the token level. TV already strips `transition-all` and `backdrop-filter`. Add to the TV branch in `tokens.css`:

```css
:root[data-tv="true"] {
  --motion-player-show:  150ms ease-out;  /* keep TV's existing fast timing */
  --motion-player-hide:  300ms ease-out;
  --motion-ripple:       0ms;             /* no gesture ripples on TV */
  --motion-badge-hide:   1200ms ease-in;  /* tap-rate badge: keep */
  --motion-sheet-in:     0ms;             /* no bottom sheet on TV */
  --motion-card-hover:   0ms;             /* no card scale on TV */
}
```

---

## 9. Open Design Decisions

### OD1. Pinch-to-fullscreen vs browser zoom conflict (recommendation: guard on `ctrlKey`)

**Problem:** On Chrome/Firefox desktop, the browser intercepts pinch-open as zoom (same event sequence as `GestureEvent` / `WheelEvent` with `ctrlKey`). We cannot reliably distinguish a user intending "fullscreen" from "zoom in on the page."

**Recommendation:** On Desktop, do not implement pinch-to-fullscreen. Keep it mobile-only (where native `TouchEvent` with 2 contacts is unambiguous). Expose the `f` key + `[⤢]` button for desktop fullscreen. This matches YouTube and Netflix web behavior.

### OD2. Drag-scrub vs swipe-to-close conflict on mobile (recommendation: require top-30% origin for swipe-close)

**Problem:** A drag-scrub starting mid-screen that curves downward could accidentally trigger swipe-close (G9).

**Recommendation:** Swipe-close (G9) only arms if the touch **starts in the top 30%** of the player and has `abs(deltaY) > abs(deltaX) * 2`. A scrub starting mid-screen is claimed by G4 (horizontal drag) within 150ms. Two recognizers cannot both be claimed simultaneously. This is the YouTube approach: swipe-down-to-close only from the top bezel drag area.

### OD3. Tap-to-pause on mobile (recommendation: NO — tap = toggle controls only)

**Problem:** Many video players (VLC, MX Player) use single-tap to pause. YouTube uses single-tap to show/hide controls, and double-tap for seek.

**Recommendation:** Match YouTube's center-tap = show/hide controls model. Do NOT toggle pause on single center-tap. Rationale: users frequently tap to check the timestamp or see the scrubber without wanting to pause. Accidental pause during tapping is annoying. The Play/Pause button is 48px × 48px and always visible in STATE 2 — one intentional tap is sufficient.

**Counter-argument:** VLC users expect tap = pause. This is a real muscle memory conflict.

**Resolution:** Accept YouTube model and make it discoverable. Hint text on first player open in touch mode: `"Tap to show controls · Double-tap side to skip"` (2s toast, one-time, stored in localStorage `sv_player_hint_shown`).

### OD4. Bottom tab bar labels on mobile narrow screens (recommendation: icons-only < 360px, labels ≥ 360px)

**Problem:** At 320px width with 5 tabs, labels like "Settings" truncate.

**Recommendation:** Labels visible at ≥ 360px (covers ~95% of modern Android phones). Below 360px, icon-only. Icons must be self-explanatory — add `aria-label` on each button regardless.

**Alternative rejected:** Always show labels (breaks 320px). Always hide labels (loses new-user discoverability).

### OD5. Desktop player: click-to-pause on video background (recommendation: YES, with 200ms debounce)

**Problem:** A single click on the player could: (a) show controls (if hidden), (b) toggle pause, (c) both simultaneously.

**Recommendation:** Desktop single-click behavior: if controls are hidden, **show controls AND pause/play** in one action (unlike mobile which requires separate taps). Rationale: desktop users are more deliberate with mouse clicks than mobile touch. Matching YouTube and Netflix desktop behavior reduces learning curve. The 200ms debounce prevents double-click-fullscreen from triggering two pause toggles.

### OD6. `norigin` spatial navigation on Desktop/Mobile (recommendation: disabled outside TV)

**Problem:** norigin is initialized globally and manages focus. On Desktop/Mobile, it may interfere with natural tab order and mouse click focus.

**Recommendation:** Initialize norigin with `shouldFocusDOMNode: true` only when `data-tv="true"`. On Desktop/Mobile, use standard DOM `tabIndex` management without norigin. The `BottomDock` on mobile/tablet needs to be a standard `<nav>` with normal tab order, not norigin-managed.

**Implementation:** In `main.tsx`:

```typescript
import { init as initSpatialNav } from "@noriginmedia/norigin-spatial-navigation";

if (document.documentElement.dataset.tv === "true") {
  initSpatialNav({ shouldFocusDOMNode: true, shouldUseNativeEvents: true });
} else {
  initSpatialNav({ shouldFocusDOMNode: false, shouldUseNativeEvents: false });
}
```

This is the highest-risk change relative to TV regression. Test gate: run existing E2E Playwright d-pad suite (`npm run test:e2e`) before any change to norigin init.

### OD7. Input-mode persistence across route changes (recommendation: persist in memory, not localStorage)

Rationale: input mode is a session property. A user who switches from mouse to keyboard mid-session wants the new mode immediately. If stored in localStorage, a user on a keyboard-only machine who last visited on a touchscreen phone would get stale touch mode. Memory-only is correct.

---

## 10. Implementation Priority Order

1. **`src/nav/inputMode.ts`** — state machine (§2.3). No UI. Low risk.
2. **`tokens.css` additions** — new `--motion-*` tokens + breakpoint overrides (§1.3, §8.2). No JS changes.
3. **Top nav bar for Desktop** — new `src/nav/TopNav.tsx` component, gated by `data-input-mode !== "dpad"` + media query. Add to `AppShell`.
4. **Mobile bottom tab bar refinements** — update `BottomDock.tsx` with mobile-safe-area tokens and icon-only < 360px.
5. **`src/player/usePlayerGestures.ts`** — gesture hook, only mounted in `touch` mode (§3.3).
6. **`PlayerControls` desktop variant** — hover show/hide, mouse wheel volume, keyboard shortcuts.
7. **Mobile bottom sheets** — replace popover positioning with slide-up sheet for audio/subs/quality.
8. **Page-by-page layout tokens** — grid overrides per breakpoint for each route.
9. **Settings > Playback panel** — swipe gesture toggle (OD3).
10. **Accessibility pass** — ARIA annotations (§7.3), screen reader announcements (§7.6).

---

## 11. TV Non-Regression Checklist

Before any PR from this spec is merged, verify:

- [ ] `npm run test:e2e` — all Playwright d-pad tests pass (silk-probe, dock nav, player controls)
- [ ] `npm run test:unit` — all unit tests pass
- [ ] norigin `setFocus` behavior unchanged in TV mode
- [ ] `data-tv="true"` still set on Fire TV UA (check `main.tsx` UA detection)
- [ ] PlayerControls tap-rate accelerator still fires on `ArrowLeft`/`ArrowRight` (PR #116)
- [ ] No `backdrop-filter` added to `PlayerShell` root div
- [ ] No `transition-all` on any TV-path element
- [ ] `--motion-ripple: 0ms` in TV token branch (no gesture ripples on d-pad)
- [ ] Bottom dock still renders as floating pill on TV viewport
- [ ] events-router catchall still last-mounted (PR #54 ordering)

---

**End of spec.**

*Sources informing this spec:*
- [YouTube double-tap skip UI pattern — Waveguide](https://www.waveguide.io/examples/entry/10-seconds-skip/)
- [YouTube drag-and-hold scrub gesture — 9to5Google](https://9to5google.com/2021/08/06/youtube-for-mobile-gains-new-drag-and-hold-gesture-for-video-scrubbing/)
- [Gestify video gesture control guide (swipe/hold/double-tap)](https://www.rabbitpair.com/en/blog/gestify-video-gesture-control-guide)
- [Material Design 3 Gestures](https://m3.material.io/foundations/interaction/gestures)
- [MDN pointer media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/pointer)
- [Smashing Magazine: hover and pointer media queries](https://www.smashingmagazine.com/2022/03/guide-hover-pointer-media-queries/)
- [Responsive Web Design breakpoints 2026 — DisplayPixels](https://displaypixels.io/learn/responsive-design-breakpoints.html)
- [Modern CSS 2026: Container Queries — WSkill](https://blog.weskill.org/2026/03/modern-css-2026-container-queries_01245639116.html)
- [Media Chrome responsive controls docs](https://www.media-chrome.org/docs/en/responsive-controls)
- [Plex keyboard shortcuts reference](https://maketecheasier.com/cheatsheet/plex-keyboard-shortcuts/)
- [VLC iOS gesture controls (volume/brightness left/right edge pattern)](https://www.addictivetips.com/ios/playback-volume-brightness-control-gestures-vlc-player-for-ios/)
