# 05 — Player UX

**Owner:** UX Lead
**Status:** New spec 2026-04-22 (player UX was previously unwritten)
**Scope:** The fullscreen Player overlay — controls, D-pad flow, auto-hide, popovers for audio/subtitles/quality, Live vs VOD differences.
**Parent:** `00-ia-navigation.md` (Player is depth 3 overlay — see §2.4 back-stack)

---

## 0. Reality anchor

| What exists | What doesn't |
|---|---|
| `<video>` element driven by `useHlsPlayer` hook | Picture-in-picture |
| HLS.js quality levels, audio tracks, text tracks (subtitles) | Cast / AirPlay |
| `PlayerProvider` with one instance, history sentinel for Back handling | Chromecast |
| Live + VOD + series-episode `kind` discrimination | Chapter markers (metadata isn't there) |
| Backend `/api/stream` returns a URL for a given id + kind | 4K-specific rendering toggles |

**Design consequence:** all controls are local-playback; no casting affordances ship. Focus is on **making every available action reachable in ≤3 D-pad presses** without auto-hiding prematurely or hiding behind long-presses.

---

## 1. The problem this spec solves

Current prod state: controls are incomplete or hidden. User can't reliably:
- Pause / play
- Seek back / forward 10 seconds
- Jump by larger amounts (30s, 1min, or scrub to arbitrary timestamp)
- Change audio track (Telugu / Hindi dual-audio movies)
- Change subtitle track / toggle off
- Change video quality (HD → SD on slow network)
- Adjust volume

This spec defines a **single, always-reachable control bar** with all of the above. No hidden menus. No long-press.

---

## 2. Layout — control bar

When shown, the player overlays two glass bands on top of the `<video>`:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ← Back     Title / Channel Name  ·  S2E5 "Episode Title" · 18:42/44:12    │ ← TOP BAR
│                                                                            │
│                                                                            │
│                         [ video fills frame ]                              │
│                                                                            │
│                                                                            │
│  ▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  18:42 / 44:12          │ ← SCRUBBER
│  ┌──┐ ┌──┐ ┌──┐   ┌──┐ ┌──┐   ┌──────┐ ┌──────┐ ┌─────────┐ ┌──────────┐  │
│  │⏮ │ │⏯ │ │⏭ │   │◀◀│ │▶▶│   │🔉 50│ │Audio▾│ │Subtitles▾│ │Quality ▾│  │ ← CONTROL BAR
│  └──┘ └──┘ └──┘   └──┘ └──┘   └──────┘ └──────┘ └─────────┘ └──────────┘  │
│   prev pause next  -10s  +10s  volume   audio    subtitles    quality      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Three glass bands:**
- **Top bar**: title + current timestamp + Back affordance
- **Scrubber**: progress, current time, total time
- **Control bar**: 9 actions, all reachable via `ArrowLeft`/`ArrowRight`

Everything uses the glass treatment from `00-ia §6.8` — `rgba(0,0,0,0.45)` gradient with `blur(12px)` on the band itself, not on the video.

---

## 3. Control anatomy (left-to-right)

| # | Control | Icon | D-pad action | Live behavior | VOD/Series behavior |
|---|---|---|---|---|---|
| 1 | **Previous** | ⏮ | `Enter` | Previous channel in current language filter | Previous episode in season (series) / **disabled** on movie |
| 2 | **Play / Pause** | ⏯ | `Enter` | Toggle pause (live streams can pause briefly; will jump to live on resume) | Toggle pause |
| 3 | **Next** | ⏭ | `Enter` | Next channel in current language filter | Next episode (series) / **disabled** on movie |
| 4 | **Seek back 10s** | ◀◀ | `Enter` | **Disabled on Live** | Seek -10s |
| 5 | **Seek forward 10s** | ▶▶ | `Enter` | **Disabled on Live** | Seek +10s |
| 6 | **Volume** | 🔉 / 🔊 / 🔇 | `Enter` opens vertical slider | Always enabled | Always enabled |
| 7 | **Audio track ▾** | 🎧 | `Enter` opens popover | `aria-disabled` if only 1 track | Popover list |
| 8 | **Subtitles ▾** | CC | `Enter` opens popover | Same | List incl. "Off" |
| 9 | **Quality ▾** | ⚙ | `Enter` opens popover | HLS levels list + "Auto" | Same |

### 3.1 Disabled states

When a control is disabled (e.g. Seek on Live, Next-episode on a movie), D-pad **skips past it** (`focusable: false`) so the user doesn't land on a dead button. Do not dim-render; don't render at all.

This keeps the control count adaptive: Live shows 7 buttons (no ±10s), Movies show 8 (no prev/next episode), Series show 9 (all of them).

### 3.2 Tap-rate accelerator on ±10s

Each press of ◀◀ or ▶▶ — `Enter` on the focused button OR `ArrowLeft`/`ArrowRight` on any transport-row button (Play/Pause, ◀◀, ▶▶) — feeds a single rate accelerator. The per-tap delta scales with tap density:

| Taps in last 1s | Per-tap delta |
|---|---|
| 1–2 | ±10 s |
| 3–5 | ±30 s |
| 6+  | ±60 s |

Direction reset (Right→Left or Left→Right) clears the window so an over-shoot doesn't snap back N×. A copper "▶▶ 3×" / "◀◀ 6×" badge appears above the scrubber while the multiplier is above 1× and fades 1.2 s after the last tap.

**Rationale (revised 2026-04-25 after two failed hold-timer attempts in PRs #110 / #115):** Silk on Fire TV emits held d-pad as rapid keydown+keyup pairs, not a sustained keydown. The user described it as "click click click for every 10 seconds." A timer-based hold model never armed reliably; a rate-based model treats both *held arrows* and *fast taps* identically because the only signal we measure is *seek-action frequency*. The user does not need to learn anything new — keep tapping, the jumps grow.

---

## 4. D-pad focus flow

### 4.1 Enter the player

On player open: focus is **on the central Play/Pause button** (#2 above). Control bar and top bar are both visible. A 3-second idle timer begins.

### 4.2 Within the player

```
                TOP BAR  (Back)
                   ↑
                   │ ArrowUp from Control bar reveals top bar focus on Back
                   │
              SCRUBBER  (position indicator, not focusable — scrubber is controlled by ±10s buttons and hold-to-seek)
                   ↑
                   │ ArrowUp from Control bar → directly to Back (scrubber skipped)
                   │
              CONTROL BAR  (9 controls, wrap-free)
              ⏮ ⏯ ⏭ ◀◀ ▶▶ 🔉 Audio Subs Quality
              ←─────────────────────→   ArrowLeft / ArrowRight
```

**Rules:**
- `ArrowLeft` / `ArrowRight` walks the Control bar in visual order, skipping disabled controls
- `ArrowLeft` on first control → stays (no wrap)
- `ArrowRight` on last control → stays (no wrap)
- `ArrowUp` from any Control bar button → focus the **Back** arrow in the top bar
- `ArrowDown` from Back → focus returns to Play/Pause (not wherever they came from — predictable)
- `ArrowUp` from Back → no-op (nothing above)
- Any D-pad press wakes the idle timer — controls stay visible another 3s

### 4.3 Idle auto-hide

- **After 3s of no input**: top bar + control bar fade (300ms). Scrubber stays visible a little longer (+1s) then fades too. Video continues.
- **Any D-pad press wakes everything.** First press just shows controls; it doesn't trigger the action. (Prevents accidental skip / pause when a user is just re-orienting.)
- **Exception**: `Enter` / `OK` while controls are hidden **immediately pauses/plays** (the primary action is so common we short-circuit the wake step). Tested on real TVs — people don't want two presses just to pause.

### 4.4 Back button

Progressive close:

```
  Popover open (audio/subs/quality)   → (Back) → close popover, focus returns to its button
  Controls hidden                     → (Back) → close player, return to originating card
  Controls visible                    → (Back) → close player (wake + close in one press is fine)
```

No double-Back traps. The PlayerProvider's history sentinel handles this.

---

## 5. Popovers — audio / subtitles / quality

All three follow the same glass-popover pattern.

```
                              ┌──────────────────────┐
                              │  ● English (default) │
                              │  ○ Telugu            │  ← focus cycles with Up/Down
                              │  ○ Hindi             │
                              │  ○ Off               │
                              └──────────────────────┘
                                         ↑
                              [Subs ▾]  ← button that spawned it
```

- Renders **above** its button (bottom-anchored), glass blur treatment (§6.8 in IA).
- Focus auto-lands on the current selection.
- `ArrowUp` / `ArrowDown` walks the list.
- `Enter` commits the choice and closes popover.
- `Back` closes without committing.
- `ArrowLeft` / `ArrowRight` on any item → close popover, move to prev/next control in the bar. (So you can scroll fast through audio → subs → quality without three round-trips.)

### 5.1 Audio track popover

Reads `hls.audioTracks`. Each track's label comes from the HLS manifest (`NAME` attribute, or `LANGUAGE` code fallback). If the track has no name, render `"Track N"`.

### 5.2 Subtitle popover

Reads `video.textTracks` + HLS subtitle levels. Always renders "Off" as the top option. Checkmark on current. Selecting "Off" sets all text tracks to `mode = "disabled"`.

### 5.3 Quality popover

Reads `hls.levels`. Order: Auto (top), then actual levels **highest-to-lowest** (e.g. 1080p · 720p · 540p · 360p). Current pick auto-focused. Selecting "Auto" sets `hls.currentLevel = -1`.

**Why highest-first:** the reason to open this popover is almost always "my stream is stuttering, lower it." Putting 1080p at the top keeps "Auto" as the first stop and the lower options right below.

---

## 6. Volume — vertical slider popover

Pressing `Enter` on the volume icon opens a vertical bar above it:

```
                              ┌────┐
                              │    │ ← top = 100%
                              │ ▓▓ │
                              │ ▓▓ │
                              │ ▓▓ │
                              │ ▓▓ │ ← current 50%
                              │ ░░ │
                              │ ░░ │
                              └────┘
                                ↑
                              [🔉]
```

- `ArrowUp` / `ArrowDown` adjusts volume in **5% steps**.
- `Enter` or `Back` closes.
- Auto-close after 2s of no adjustment.
- Icon glyph swaps: 🔇 (0%), 🔉 (1-66%), 🔊 (67-100%).

### 6.1 Remote volume buttons (Fire TV)

Fire TV remotes have physical volume keys that bypass the web app. We don't intercept those — they control TV volume. The in-app volume is a **stream-level gain** separate from system volume (useful when a specific movie is quiet).

---

## 7. Scrubber

Visible whenever controls are visible. Not a focusable element — position is driven by the ±10s buttons and hold-to-seek. Shows:

- Filled portion = `currentTime / duration`
- Thumb indicator at the current position
- Left caption: current time in `mm:ss` or `h:mm:ss` if >1h
- Right caption: total duration, same format
- **On Live**: scrubber hidden. Replaced by a static `● LIVE` badge in the top bar.

### 7.1 Resume point marker

If the video has a saved resume point (user is mid-watching), a faint copper tick appears on the scrubber at that position. When the user returns after a Back-out, the video **auto-seeks to the resume point** and the mark disappears.

---

## 8. Live vs VOD differences — summary

| Feature | Live | VOD | Series episode |
|---|---|---|---|
| Play / Pause | ✓ (pauses briefly; resumes at live edge) | ✓ | ✓ |
| Scrubber | hidden, shows `● LIVE` badge | ✓ | ✓ |
| ±10s seek | ✗ | ✓ | ✓ |
| Hold-to-scrub | ✗ | ✓ | ✓ |
| Prev / Next | Prev/next channel | both disabled | Prev/next episode |
| Audio track | ✓ | ✓ | ✓ |
| Subtitles | ✓ | ✓ | ✓ |
| Quality | ✓ (live HLS levels) | ✓ | ✓ |
| Volume | ✓ | ✓ | ✓ |

---

## 9. Error + loading states

### 9.1 Loading (buffering)

Center of screen, glass-circular spinner (32px), copper accent. Auto-hides when `video.readyState >= 2`. Times out after 15s → triggers error state.

### 9.2 Playback failure

Full glass overlay, amber (not red) per 00-ia §6.3:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                        ⚠                                 │
│                                                          │
│               Playback failed                            │
│                                                          │
│   This title couldn't be played right now.               │
│   It may be a format your plan doesn't support,          │
│   or the provider is temporarily unavailable.            │
│                                                          │
│        [ Try again ]     [ Back to browse ]              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Focus auto-seeded on "Try again".
- "Back to browse" closes the player and restores focus to the originating card.
- **Never** auto-retry silently. Users deserve to see the failure mode.

### 9.3 Tier-locked (0-byte stream — Xtream format limit)

Same template as 9.2 but with specific copy:

> This title is delivered in a format your Xtream plan doesn't support (`.mp4` vs the plan's `.ts`). Try a different title or see if a similar one is available.

No "Try again" button (won't help) — just "Back to browse".

---

## 10. Accessibility

- Every control has an `aria-label` reflecting current state: `aria-label="Pause"` vs `aria-label="Play"`.
- Volume slider: `role="slider"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- Popovers: `role="listbox"`; items: `role="option"` with `aria-selected` on current.
- Scrubber position announced via live region when seeking (`aria-live="polite"`).
- Focus ring from the global `--focus-ring` token (§6.8 IA). Visible on every focused control.
- **Reduced motion**: popover slide-in → instant; spinner rotation → static with pulse; idle fade → instant show/hide.

---

## 11. Click budgets

| Task | Presses |
|---|---|
| Pause from normal watching | **1** (Enter — short-circuit from §4.3) |
| Seek back 10s | **1** (Enter on ⏮⏯⏭←◀ ... no — it's 1 from rest, or wake + 1) |
| Change audio to Telugu | **3** (Right to Audio → Enter → Down/Up to Telugu → Enter = 4 actually; acceptable) |
| Drop quality from Auto to 720p | **3** (Right to Quality → Enter → Down to 720p → Enter = 4) |
| Exit player | **1** (Back) |
| Exit player → back to previous screen's originating card | **1** (Back, PlayerProvider handles focus restore) |

---

## 12. Decision log

| # | Decision | Alternative rejected |
|---|---|---|
| 1 | Single always-reachable control bar with all 9 actions | Tiered menus (Fire TV remote can't handle nested discovery) |
| 2 | Auto-hide after 3s idle, wake on any D-pad | Always-visible controls (occludes video at 10-foot) |
| 3 | First wake press shows controls only; doesn't trigger action | Wake + action in one press (too many accidental skips) |
| 4 | `Enter` short-circuits pause/play even when controls hidden | Require wake first (too slow for the #1 user action) |
| 5 | Disabled controls are `focusable:false`, not dimmed | Dimmed-but-focusable (lands on dead targets) |
| 6 | Tap-rate accelerator on ±10s (10s → 30s → 60s by tap density) | Hold-timer (PRs #110/#115 — Silk on Fire TV emits hold as auto-tap pairs, timer never armed reliably in prod) |
| 7 | Quality popover orders highest-first | Lowest-first (open-intent is "lower it") |
| 8 | Volume is in-app (stream gain), remote volume keys affect TV | In-app intercepts remote (breaks Fire TV norm) |
| 9 | Popovers close on Left/Right + advance to next control | Popovers require Back to close (slower to walk all three) |
| 10 | Amber error, never red; specific copy for tier-lock | Red + generic "Playback error" (scary + useless) |

---

## 13. Out of scope

Picture-in-picture, Chromecast, AirPlay, chapter markers, per-show stills / hero card during seek, trailer autoplay, watch parties.

---

**End of spec.**
