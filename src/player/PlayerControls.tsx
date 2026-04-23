/**
 * PlayerControls — three-band overlay per docs/ux/05-player.md.
 *
 *   TOP BAR       ← Back · Title · [S2E5 "Title"] · live timestamp / ● LIVE
 *   SCRUBBER      progress + current/total time (hidden on Live, replaced by badge)
 *   CONTROL BAR   ⏯ · ◀◀ ▶▶ · 🔉 · Audio ▾ · Subs ▾ · Quality ▾
 *                 (prev/next episode + channel wiring is a Phase 6c follow-on)
 *
 * 6a shipped the structural shell; 6b layers hold-to-scrub, the volume
 * slider popover, auto-focus on the current selection when a popover
 * opens, and Left/Right on any popover item dismisses it and advances
 * to the next sibling control (spec §5).
 */
import type { RefObject, CSSProperties } from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import type { KeyPressDetails } from "@noriginmedia/norigin-spatial-navigation";
import type {
  HlsLevel,
  HlsAudioTrack,
  HlsSubtitleTrack,
  PlayerStatus,
} from "./useHlsPlayer";
import type { PlayerKind } from "./PlayerProvider";
import { useReducedMotion } from "./useReducedMotion";

// ─── Focus keys (exported for tests + call sites) ────────────────────────────

export const FK = {
  BACK: "PLAYER_BACK",
  PREV: "PLAYER_PREV",
  PLAY_PAUSE: "PLAYER_PLAY_PAUSE",
  NEXT: "PLAYER_NEXT",
  SEEK_BACK: "PLAYER_SEEK_BACK",
  SEEK_FORWARD: "PLAYER_SEEK_FORWARD",
  VOLUME: "PLAYER_VOLUME",
  VOLUME_SLIDER: "PLAYER_VOLUME_SLIDER",
  AUDIO: "PLAYER_AUDIO",
  SUBTITLES: "PLAYER_SUBTITLES",
  QUALITY: "PLAYER_QUALITY",
} as const;

const AUTO_HIDE_MS = 3000;
const FADE_MS = 300;
const HOLD_SEEK_STEP_S = 30;
const HOLD_SEEK_TICK_MS = 500;
const VOLUME_STEP = 0.05;
const VOLUME_SLIDER_IDLE_MS = 2000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function volumeIcon(volume: number): string {
  if (volume <= 0) return "🔇";
  if (volume < 0.67) return "🔉";
  return "🔊";
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PlayerControlsProps {
  title: string;
  kind: PlayerKind;
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  volume: number;
  levels: HlsLevel[];
  audioTracks: HlsAudioTrack[];
  subtitleTracks: HlsSubtitleTrack[];
  currentLevel?: number;
  currentAudioTrack?: number;
  currentSubtitleTrack?: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onClose: () => void;
  onSetVolume: (v: number) => void;
  onSelectLevel: (idx: number) => void;
  onSelectAudioTrack: (idx: number) => void;
  onSelectSubtitleTrack: (idx: number) => void;
  /**
   * Jump to the previous sibling (prev channel on Live, prev episode on a
   * series). Undefined means the button is hidden — spec §3.1 says disabled
   * controls don't render. Movies never get these.
   */
  onPrev?: () => void;
  onNext?: () => void;
}

type MenuName = "audio" | "subtitles" | "quality" | "volume";

// ─── Popover list item ───────────────────────────────────────────────────────

interface MenuItemProps {
  label: string;
  isActive: boolean;
  focusKey: string;
  onSelect: () => void;
  onDismissLeft?: () => void;
  onDismissRight?: () => void;
}

function MenuItem({
  label,
  isActive,
  focusKey: fk,
  onSelect,
  onDismissLeft,
  onDismissRight,
}: MenuItemProps) {
  const { ref, focused } = useFocusable({
    focusKey: fk,
    onEnterPress: onSelect,
    onArrowPress: (direction) => {
      // Up/Down walks the list via norigin default geometric nav.
      if (direction === "left" && onDismissLeft) {
        onDismissLeft();
        return false;
      }
      if (direction === "right" && onDismissRight) {
        onDismissRight();
        return false;
      }
      return true;
    },
  });
  const highlighted = isActive || focused;

  return (
    <li style={{ listStyle: "none" }} role="option" aria-selected={isActive}>
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        className="focus-ring"
        onClick={onSelect}
        style={{
          display: "block",
          width: "100%",
          padding: "var(--space-2) var(--space-4)",
          background: highlighted ? "var(--accent-copper)" : "var(--bg-elevated)",
          color: highlighted ? "var(--bg-base)" : "var(--text-primary)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          fontSize: "var(--text-body-size)",
          textAlign: "left",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
    </li>
  );
}

// ─── Control-bar button ──────────────────────────────────────────────────────

interface ControlButtonProps {
  focusKey: string;
  label: string;
  icon: string;
  focusable?: boolean;
  onPress: () => void;
  isEdgeLeft?: boolean;
  isEdgeRight?: boolean;
  ariaExpanded?: boolean;
  ariaHasPopup?: boolean;
  extraStyle?: CSSProperties;
  onHoldTick?: () => void;
  /**
   * Per-direction arrow overrides. When set, the override runs and norigin
   * nav is blocked. Used by transport buttons (Play/Pause + ±10s) for
   * arrow-seek + ArrowDown-to-settings-row (6d prod feedback).
   */
  arrowOverrides?: Partial<Record<"left" | "right" | "up" | "down", () => void>>;
  /**
   * Where ArrowUp lands. Defaults to FK.BACK per spec §4.2. Right-side
   * settings (Volume/Audio/Subs/Quality) override this to FK.PLAY_PAUSE
   * so Down→settings→Up returns to the transport instead of bouncing to
   * Back.
   */
  upTarget?: string;
}

function ControlButton({
  focusKey,
  label,
  icon,
  focusable = true,
  onPress,
  isEdgeLeft = false,
  isEdgeRight = false,
  ariaExpanded,
  ariaHasPopup,
  extraStyle,
  onHoldTick,
  arrowOverrides,
  upTarget = FK.BACK,
}: ControlButtonProps) {
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHold = useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const { ref, focused } = useFocusable({
    focusKey,
    focusable,
    onEnterPress: (_: unknown, details: KeyPressDetails) => {
      if ((details.pressedKeys?.enter ?? 0) > 1) return;
      onPress();
      if (onHoldTick) {
        clearHold();
        holdIntervalRef.current = setInterval(onHoldTick, HOLD_SEEK_TICK_MS);
      }
    },
    onEnterRelease: clearHold,
    onArrowPress: (direction) => {
      const dir = direction as "left" | "right" | "up" | "down";
      const override = arrowOverrides?.[dir];
      if (override) {
        override();
        return false;
      }
      if (dir === "up") {
        setFocus(upTarget);
        return false;
      }
      if (dir === "down") return false;
      if (dir === "left" && isEdgeLeft) return false;
      if (dir === "right" && isEdgeRight) return false;
      return true;
    },
  });

  // Clear any in-flight hold on unmount / focusable-flip to avoid zombie
  // intervals. (If the user clicks away to another control, onEnterRelease
  // fires via keyup, but blur without keyup — e.g., programmatic setFocus —
  // would otherwise leak.)
  useEffect(() => clearHold, [clearHold]);

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      className="focus-ring"
      aria-label={label}
      aria-disabled={!focusable}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      onClick={focusable ? onPress : undefined}
      tabIndex={focusable ? 0 : -1}
      style={{
        ...controlButtonStyle,
        opacity: focusable ? 1 : 0.35,
        outline: focused ? "2px solid var(--accent-copper)" : undefined,
        cursor: focusable ? "pointer" : "default",
        ...extraStyle,
      }}
    >
      {icon}
    </button>
  );
}

// ─── Volume slider popover (spec §6) ─────────────────────────────────────────

interface VolumeSliderProps {
  volume: number;
  onSetVolume: (v: number) => void;
  onClose: () => void;
  onDismissLeft?: () => void;
  onDismissRight?: () => void;
}

function VolumeSlider({
  volume,
  onSetVolume,
  onClose,
  onDismissLeft,
  onDismissRight,
}: VolumeSliderProps) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(onClose, VOLUME_SLIDER_IDLE_MS);
  }, [onClose]);

  const { ref, focused } = useFocusable({
    focusKey: FK.VOLUME_SLIDER,
    onEnterPress: onClose,
    onArrowPress: (direction) => {
      scheduleClose();
      if (direction === "up") {
        onSetVolume(clamp01(volume + VOLUME_STEP));
        return false;
      }
      if (direction === "down") {
        onSetVolume(clamp01(volume - VOLUME_STEP));
        return false;
      }
      if (direction === "left" && onDismissLeft) {
        onDismissLeft();
        return false;
      }
      if (direction === "right" && onDismissRight) {
        onDismissRight();
        return false;
      }
      return false;
    },
  });

  // Seed focus + start idle timer on mount. The setFocus in PlayerControls'
  // openMenu effect also targets this key — duplicate is cheap and safe.
  useEffect(() => {
    setFocus(FK.VOLUME_SLIDER);
    scheduleClose();
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [scheduleClose]);

  const pct = Math.round(volume * 100);

  return (
    <div
      ref={ref as RefObject<HTMLDivElement>}
      role="slider"
      aria-label="Volume"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-live="polite"
      tabIndex={0}
      style={{
        position: "absolute",
        bottom: "calc(100% + var(--space-2))",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--bg-elevated)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-2)",
        width: "56px",
        zIndex: 10,
        outline: focused ? "2px solid var(--accent-copper)" : undefined,
      }}
    >
      <span
        style={{
          fontSize: "var(--text-label-size)",
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pct}
      </span>
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          width: "6px",
          height: "120px",
          background: "rgba(255,255,255,0.2)",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: `${pct}%`,
            background: "var(--accent-copper)",
          }}
        />
      </div>
      <span aria-hidden="true" style={{ fontSize: "18px" }}>
        {volumeIcon(volume)}
      </span>
    </div>
  );
}

// ─── PlayerControls ──────────────────────────────────────────────────────────

export function PlayerControls({
  title,
  kind,
  status,
  currentTime,
  duration,
  volume,
  levels,
  audioTracks,
  subtitleTracks,
  currentLevel = -1,
  currentAudioTrack = -1,
  currentSubtitleTrack = -1,
  onPlay,
  onPause,
  onSeek,
  onClose,
  onSetVolume,
  onSelectLevel,
  onSelectAudioTrack,
  onSelectSubtitleTrack,
  onPrev,
  onNext,
}: PlayerControlsProps) {
  const reducedMotion = useReducedMotion();

  // Controls open visible (spec §4.1), then fade after AUTO_HIDE_MS idle.
  const [visible, setVisible] = useState(true);
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Keep a ref to currentTime so hold-to-scrub ticks can seek from the
  // latest position instead of the one captured when hold started.
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const { ref: containerRef, focusKey: containerFocusKey } = useFocusable({
    focusKey: "PLAYER_CONTROLS",
    trackChildren: true,
  });

  const isPlaying = status === "playing";
  const isLive = kind === "live";

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setOpenMenu(null);
    }, AUTO_HIDE_MS);
  }, []);

  const wake = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

  // Initial focus on Play/Pause when the player opens (spec §4.1).
  useEffect(() => {
    setFocus(FK.PLAY_PAUSE);
    scheduleHide();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture-phase key interceptor: wake-only on first arrow when hidden,
  // Enter short-circuits pause/play (spec §4.3). Also handles media keys
  // (TV remote) and Escape.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Back" || e.key === "GoBack") {
        e.preventDefault();
        if (openMenu) {
          setOpenMenu(null);
        } else {
          onClose();
        }
        return;
      }

      if (e.key === "MediaPlayPause" || e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlayPause();
        wake();
        return;
      }
      if ((e.key === "MediaRewind" || e.key === "j") && !isLive) {
        e.preventDefault();
        onSeek(currentTimeRef.current - 10);
        wake();
        return;
      }
      if ((e.key === "MediaFastForward" || e.key === "l") && !isLive) {
        e.preventDefault();
        onSeek(currentTimeRef.current + 10);
        wake();
        return;
      }

      const isArrow =
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight";
      const isEnter = e.key === "Enter" || e.key === "OK";

      if (!visibleRef.current) {
        if (isArrow) {
          e.preventDefault();
          e.stopPropagation();
          wake();
          return;
        }
        if (isEnter) {
          e.preventDefault();
          e.stopPropagation();
          togglePlayPause();
          wake();
          return;
        }
      } else {
        if (isArrow || isEnter) wake();
      }
    };

    const onMouseMove = () => wake();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [onClose, onSeek, isLive, openMenu, togglePlayPause, wake]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Focusables for top bar ────────────────────────────────────────────────

  const { ref: backRef, focused: backFocused } = useFocusable({
    focusKey: FK.BACK,
    onEnterPress: onClose,
    onArrowPress: (direction) => {
      if (direction === "down") {
        setFocus(FK.PLAY_PAUSE);
        return false;
      }
      return false;
    },
  });

  // ── Control bar wire-up ────────────────────────────────────────────────────

  const handleSeekBack = useCallback(
    () => onSeek(currentTimeRef.current - 10),
    [onSeek],
  );
  const handleSeekForward = useCallback(
    () => onSeek(currentTimeRef.current + 10),
    [onSeek],
  );
  const holdSeekBack = useCallback(
    () => onSeek(currentTimeRef.current - HOLD_SEEK_STEP_S),
    [onSeek],
  );
  const holdSeekForward = useCallback(
    () => onSeek(currentTimeRef.current + HOLD_SEEK_STEP_S),
    [onSeek],
  );

  const openAudio = useCallback(
    () => setOpenMenu((m) => (m === "audio" ? null : "audio")),
    [],
  );
  const openSubs = useCallback(
    () => setOpenMenu((m) => (m === "subtitles" ? null : "subtitles")),
    [],
  );
  const openQuality = useCallback(
    () => setOpenMenu((m) => (m === "quality" ? null : "quality")),
    [],
  );
  const openVolume = useCallback(
    () => setOpenMenu((m) => (m === "volume" ? null : "volume")),
    [],
  );
  const closeMenu = useCallback(() => setOpenMenu(null), []);

  // ── Adaptive control focusability ─────────────────────────────────────────

  const seekable = !isLive;
  const audioHasOptions = audioTracks.length > 1;
  const subsAvailable = subtitleTracks.length > 0;
  const qualityAvailable = levels.length > 0;
  const hasPrev = Boolean(onPrev);
  const hasNext = Boolean(onNext);

  const orderedKeys: string[] = [
    hasPrev ? FK.PREV : null,
    FK.PLAY_PAUSE,
    hasNext ? FK.NEXT : null,
    seekable ? FK.SEEK_BACK : null,
    seekable ? FK.SEEK_FORWARD : null,
    FK.VOLUME,
    audioHasOptions ? FK.AUDIO : null,
    subsAvailable ? FK.SUBTITLES : null,
    qualityAvailable ? FK.QUALITY : null,
  ].filter((k): k is NonNullable<typeof k> => k !== null);
  const leftEdgeKey = orderedKeys[0];
  const rightEdgeKey = orderedKeys[orderedKeys.length - 1];

  // "Right-side" = Volume/Audio/Subs/Quality. ArrowDown from the transport
  // buttons jumps here so settings are reachable without walking through
  // every seek button.
  const RIGHT_SIDE_KEYS: readonly string[] = [
    FK.VOLUME,
    FK.AUDIO,
    FK.SUBTITLES,
    FK.QUALITY,
  ];
  const firstRightSideKey = orderedKeys.find((k) => RIGHT_SIDE_KEYS.includes(k));

  // 6d — prod feedback: users expect ArrowLeft/Right to seek (Netflix
  // convention), not walk the bar. Applied to Play/Pause + ±10s buttons
  // on VOD/series-episode. Live has no seekable window so arrows fall
  // through to default nav.
  const transportArrowOverrides: Partial<
    Record<"left" | "right" | "up" | "down", () => void>
  > = {};
  if (!isLive) {
    transportArrowOverrides.left = () => onSeek(currentTimeRef.current - 10);
    transportArrowOverrides.right = () => onSeek(currentTimeRef.current + 10);
  }
  if (firstRightSideKey) {
    transportArrowOverrides.down = () => setFocus(firstRightSideKey);
  }

  // Given a popover anchor control key, return the sibling control to jump
  // to when the user presses Left/Right inside the popover (spec §5 —
  // "Left/Right on any item closes popover + advances to the next sibling").
  function dismissTargets(anchorKey: string): {
    left: string | null;
    right: string | null;
  } {
    const idx = orderedKeys.indexOf(anchorKey);
    if (idx === -1) return { left: null, right: null };
    return {
      left: idx > 0 ? orderedKeys[idx - 1]! : null,
      right: idx < orderedKeys.length - 1 ? orderedKeys[idx + 1]! : null,
    };
  }

  // Auto-focus the current selection when a popover opens (spec §5). The
  // effect runs after MenuItems have registered with norigin, so setFocus
  // resolves synchronously.
  useEffect(() => {
    if (!openMenu) return;
    if (openMenu === "audio") {
      const key =
        currentAudioTrack >= 0
          ? `PLAYER_AUDIO_${currentAudioTrack}`
          : audioTracks[0]
            ? `PLAYER_AUDIO_${audioTracks[0].index}`
            : null;
      if (key) setFocus(key);
    } else if (openMenu === "subtitles") {
      const key =
        currentSubtitleTrack >= 0
          ? `PLAYER_SUBTITLE_${currentSubtitleTrack}`
          : "PLAYER_SUBTITLES_OFF";
      setFocus(key);
    } else if (openMenu === "quality") {
      const key =
        currentLevel >= 0
          ? `PLAYER_QUALITY_${currentLevel}`
          : "PLAYER_QUALITY_AUTO";
      setFocus(key);
    } else if (openMenu === "volume") {
      setFocus(FK.VOLUME_SLIDER);
    }
  }, [
    openMenu,
    currentAudioTrack,
    currentSubtitleTrack,
    currentLevel,
    audioTracks,
  ]);

  // Helper to build Left/Right dismiss callbacks for a popover rooted at
  // `anchorKey`. Always closes the popover, then hops to the sibling.
  // tsconfig has exactOptionalPropertyTypes:true — only include the key
  // when a sibling actually exists.
  const buildDismiss = (
    anchorKey: string,
  ): { onDismissLeft?: () => void; onDismissRight?: () => void } => {
    const { left, right } = dismissTargets(anchorKey);
    const out: { onDismissLeft?: () => void; onDismissRight?: () => void } = {};
    if (left) {
      out.onDismissLeft = () => {
        closeMenu();
        setFocus(left);
      };
    }
    if (right) {
      out.onDismissRight = () => {
        closeMenu();
        setFocus(right);
      };
    }
    return out;
  };

  return (
    <FocusContext.Provider value={containerFocusKey}>
      <div
        ref={containerRef as RefObject<HTMLDivElement>}
        data-testid="player-controls"
        aria-hidden={!visible}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: visible ? "auto" : "none",
          opacity: visible ? 1 : 0,
          // Spec §10 — prefers-reduced-motion disables the fade.
          transition: reducedMotion ? "none" : `opacity ${FADE_MS}ms ease-out`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* ─── TOP BAR ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            padding: "var(--space-4) var(--space-6)",
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.25) 70%, transparent 100%)",
          }}
        >
          <button
            ref={backRef as RefObject<HTMLButtonElement>}
            type="button"
            className="focus-ring"
            aria-label="Back"
            onClick={onClose}
            style={{
              ...controlButtonStyle,
              outline: backFocused ? "2px solid var(--accent-copper)" : undefined,
            }}
          >
            ←
          </button>
          <span
            style={{
              fontSize: "var(--text-title-size)",
              fontWeight: 600,
              color: "var(--text-primary)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
          {isLive ? (
            <span
              aria-label="Live"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-tracking)",
                textTransform: "uppercase",
                color: "var(--text-primary)",
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                background: "rgba(0,0,0,0.45)",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#E5484D",
                  display: "inline-block",
                }}
              />
              Live
            </span>
          ) : (
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: "var(--text-body-size)",
                color: "var(--text-secondary)",
              }}
            >
              {formatTime(currentTime)}
              {duration > 0 ? ` / ${formatTime(duration)}` : ""}
            </span>
          )}
        </div>

        {/* ─── BOTTOM STACK: scrubber + control bar ─────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            padding: "var(--space-4) var(--space-6)",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)",
          }}
        >
          {!isLive && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                fontSize: "var(--text-label-size)",
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>{formatTime(currentTime)}</span>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
                aria-label="Video progress"
                style={{
                  flex: 1,
                  height: "4px",
                  background: "rgba(255,255,255,0.2)",
                  borderRadius: "2px",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${progress}%`,
                    background: "var(--accent-copper)",
                    borderRadius: "2px",
                  }}
                />
              </div>
              <span>{duration > 0 ? formatTime(duration) : "—"}</span>
            </div>
          )}

          {/* Control bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
            }}
          >
            {hasPrev && onPrev && (
              <ControlButton
                focusKey={FK.PREV}
                label={isLive ? "Previous channel" : "Previous episode"}
                icon="⏮"
                onPress={onPrev}
                isEdgeLeft={leftEdgeKey === FK.PREV}
                isEdgeRight={rightEdgeKey === FK.PREV}
              />
            )}

            <ControlButton
              focusKey={FK.PLAY_PAUSE}
              label={isPlaying ? "Pause" : "Play"}
              icon={isPlaying ? "⏸" : "▶"}
              onPress={togglePlayPause}
              isEdgeLeft={leftEdgeKey === FK.PLAY_PAUSE}
              isEdgeRight={rightEdgeKey === FK.PLAY_PAUSE}
              arrowOverrides={transportArrowOverrides}
            />

            {hasNext && onNext && (
              <ControlButton
                focusKey={FK.NEXT}
                label={isLive ? "Next channel" : "Next episode"}
                icon="⏭"
                onPress={onNext}
                isEdgeLeft={leftEdgeKey === FK.NEXT}
                isEdgeRight={rightEdgeKey === FK.NEXT}
              />
            )}

            <ControlButton
              focusKey={FK.SEEK_BACK}
              label="Back 10 seconds"
              icon="◀◀"
              focusable={seekable}
              onPress={handleSeekBack}
              onHoldTick={holdSeekBack}
              isEdgeLeft={leftEdgeKey === FK.SEEK_BACK}
              isEdgeRight={rightEdgeKey === FK.SEEK_BACK}
              arrowOverrides={transportArrowOverrides}
            />
            <ControlButton
              focusKey={FK.SEEK_FORWARD}
              label="Forward 10 seconds"
              icon="▶▶"
              focusable={seekable}
              onPress={handleSeekForward}
              onHoldTick={holdSeekForward}
              isEdgeLeft={leftEdgeKey === FK.SEEK_FORWARD}
              isEdgeRight={rightEdgeKey === FK.SEEK_FORWARD}
              arrowOverrides={transportArrowOverrides}
            />

            <div style={{ flex: 1 }} />

            <div style={{ position: "relative" }}>
              <ControlButton
                focusKey={FK.VOLUME}
                label="Volume"
                icon={`${volumeIcon(volume)} ${Math.round(volume * 100)}`}
                onPress={openVolume}
                ariaExpanded={openMenu === "volume"}
                ariaHasPopup
                isEdgeLeft={leftEdgeKey === FK.VOLUME}
                isEdgeRight={rightEdgeKey === FK.VOLUME}
                upTarget={FK.PLAY_PAUSE}
              />
              {openMenu === "volume" && (
                <VolumeSlider
                  volume={volume}
                  onSetVolume={onSetVolume}
                  onClose={closeMenu}
                  {...buildDismiss(FK.VOLUME)}
                />
              )}
            </div>

            {audioHasOptions && (
              <div style={{ position: "relative" }}>
                <ControlButton
                  focusKey={FK.AUDIO}
                  label="Audio track"
                  icon={`🎧 ${
                    currentAudioTrack >= 0 && audioTracks[currentAudioTrack]
                      ? audioTracks[currentAudioTrack]!.name
                      : "Audio"
                  }`}
                  onPress={openAudio}
                  ariaExpanded={openMenu === "audio"}
                  ariaHasPopup
                  isEdgeLeft={leftEdgeKey === FK.AUDIO}
                  isEdgeRight={rightEdgeKey === FK.AUDIO}
                  upTarget={FK.PLAY_PAUSE}
                />
                {openMenu === "audio" && (
                  <ul style={menuStyle} role="listbox" aria-label="Audio tracks">
                    {audioTracks.map((track) => (
                      <MenuItem
                        key={track.index}
                        label={track.name || track.lang || `Audio ${track.index}`}
                        isActive={currentAudioTrack === track.index}
                        focusKey={`PLAYER_AUDIO_${track.index}`}
                        onSelect={() => {
                          onSelectAudioTrack(track.index);
                          closeMenu();
                        }}
                        {...buildDismiss(FK.AUDIO)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}

            {subsAvailable && (
              <div style={{ position: "relative" }}>
                <ControlButton
                  focusKey={FK.SUBTITLES}
                  label="Subtitles"
                  icon={`CC ${
                    currentSubtitleTrack >= 0 && subtitleTracks[currentSubtitleTrack]
                      ? subtitleTracks[currentSubtitleTrack]!.name
                      : "Off"
                  }`}
                  onPress={openSubs}
                  ariaExpanded={openMenu === "subtitles"}
                  ariaHasPopup
                  isEdgeLeft={leftEdgeKey === FK.SUBTITLES}
                  isEdgeRight={rightEdgeKey === FK.SUBTITLES}
                  upTarget={FK.PLAY_PAUSE}
                />
                {openMenu === "subtitles" && (
                  <ul style={menuStyle} role="listbox" aria-label="Subtitles">
                    <MenuItem
                      label="Off"
                      isActive={currentSubtitleTrack === -1}
                      focusKey="PLAYER_SUBTITLES_OFF"
                      onSelect={() => {
                        onSelectSubtitleTrack(-1);
                        closeMenu();
                      }}
                      {...buildDismiss(FK.SUBTITLES)}
                    />
                    {subtitleTracks.map((track) => (
                      <MenuItem
                        key={track.index}
                        label={track.name || track.lang || `Sub ${track.index}`}
                        isActive={currentSubtitleTrack === track.index}
                        focusKey={`PLAYER_SUBTITLE_${track.index}`}
                        onSelect={() => {
                          onSelectSubtitleTrack(track.index);
                          closeMenu();
                        }}
                        {...buildDismiss(FK.SUBTITLES)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}

            {qualityAvailable && (
              <div style={{ position: "relative" }}>
                <ControlButton
                  focusKey={FK.QUALITY}
                  label="Quality"
                  icon={`⚙ ${
                    currentLevel >= 0 && levels[currentLevel]
                      ? levels[currentLevel]!.name
                      : "Auto"
                  }`}
                  onPress={openQuality}
                  ariaExpanded={openMenu === "quality"}
                  ariaHasPopup
                  isEdgeLeft={leftEdgeKey === FK.QUALITY}
                  isEdgeRight={rightEdgeKey === FK.QUALITY}
                  upTarget={FK.PLAY_PAUSE}
                />
                {openMenu === "quality" && (
                  <ul style={menuStyle} role="listbox" aria-label="Quality">
                    <MenuItem
                      label="Auto"
                      isActive={currentLevel === -1}
                      focusKey="PLAYER_QUALITY_AUTO"
                      onSelect={() => {
                        onSelectLevel(-1);
                        closeMenu();
                      }}
                      {...buildDismiss(FK.QUALITY)}
                    />
                    {[...levels]
                      .sort((a, b) => b.height - a.height)
                      .map((level) => (
                        <MenuItem
                          key={level.index}
                          label={level.name}
                          isActive={currentLevel === level.index}
                          focusKey={`PLAYER_QUALITY_${level.index}`}
                          onSelect={() => {
                            onSelectLevel(level.index);
                            closeMenu();
                          }}
                          {...buildDismiss(FK.QUALITY)}
                        />
                      ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const controlButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  color: "var(--text-primary)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-2) var(--space-3)",
  fontSize: "var(--text-body-size)",
  minWidth: "36px",
  minHeight: "36px",
};

const menuStyle: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + var(--space-2))",
  right: 0,
  background: "var(--bg-elevated)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-2)",
  margin: 0,
  minWidth: "160px",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  zIndex: 10,
  listStyle: "none",
};
