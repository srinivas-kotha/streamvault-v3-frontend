/**
 * PlayerControls — three-band overlay per docs/ux/05-player.md.
 *
 *   TOP BAR       ← Back · Title · [S2E5 "Title"] · live timestamp / ● LIVE
 *   SCRUBBER      progress + current/total time (hidden on Live, replaced by badge)
 *   CONTROL BAR   ⏯ · ◀◀ ▶▶ · 🔉 · Audio ▾ · Subs ▾ · Quality ▾
 *                 (prev/next episode + channel wiring is a Phase 6b follow-on)
 *
 * Phase 6a ships the structural shell: bands, focus flow, auto-hide, Enter
 * short-circuit. Popover list-walk + Left/Right advance, volume slider,
 * hold-to-scrub and amber failure overlay come in 6b / 6c.
 */
import type { RefObject, CSSProperties } from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import type {
  HlsLevel,
  HlsAudioTrack,
  HlsSubtitleTrack,
  PlayerStatus,
} from "./useHlsPlayer";
import type { PlayerKind } from "./PlayerProvider";

// ─── Focus keys (exported for tests + call sites) ────────────────────────────

export const FK = {
  BACK: "PLAYER_BACK",
  PLAY_PAUSE: "PLAYER_PLAY_PAUSE",
  SEEK_BACK: "PLAYER_SEEK_BACK",
  SEEK_FORWARD: "PLAYER_SEEK_FORWARD",
  VOLUME: "PLAYER_VOLUME",
  AUDIO: "PLAYER_AUDIO",
  SUBTITLES: "PLAYER_SUBTITLES",
  QUALITY: "PLAYER_QUALITY",
} as const;

const AUTO_HIDE_MS = 3000;
const FADE_MS = 300;

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

function volumeIcon(volume: number, muted: boolean): string {
  if (muted || volume <= 0) return "🔇";
  if (volume < 0.67) return "🔉";
  return "🔊";
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PlayerControlsProps {
  title: string;
  kind: PlayerKind;
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
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
  onToggleMute: () => void;
  onSelectLevel: (idx: number) => void;
  onSelectAudioTrack: (idx: number) => void;
  onSelectSubtitleTrack: (idx: number) => void;
}

// ─── Menu item used by the existing dropdown popovers ────────────────────────

interface MenuItemProps {
  label: string;
  isActive: boolean;
  focusKey: string;
  onSelect: () => void;
}

function MenuItem({ label, isActive, focusKey: fk, onSelect }: MenuItemProps) {
  const { ref, focused } = useFocusable({
    focusKey: fk,
    onEnterPress: onSelect,
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
}: ControlButtonProps) {
  const { ref, focused } = useFocusable({
    focusKey,
    focusable,
    onEnterPress: onPress,
    // Up from any control bar button → Back (spec §4.2).
    // Edge Left/Right blocks default nav so focus doesn't wander (spec: no wrap).
    // Down is a no-op — nothing below the control bar.
    // All returns false only when we explicitly handle the direction.
    onArrowPress: (direction) => {
      if (direction === "up") {
        setFocus(FK.BACK);
        return false;
      }
      if (direction === "down") return false;
      if (direction === "left" && isEdgeLeft) return false;
      if (direction === "right" && isEdgeRight) return false;
      return true;
    },
  });

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

// ─── PlayerControls ──────────────────────────────────────────────────────────

export function PlayerControls({
  title,
  kind,
  status,
  currentTime,
  duration,
  volume,
  muted,
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
  onToggleMute,
  onSelectLevel,
  onSelectAudioTrack,
  onSelectSubtitleTrack,
}: PlayerControlsProps) {
  // Controls open visible (spec §4.1), then fade after AUTO_HIDE_MS idle.
  const [visible, setVisible] = useState(true);
  const [openMenu, setOpenMenu] = useState<"audio" | "subtitles" | "quality" | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref for visibility inside capture-phase handler so we don't depend
  // on stale state captured by the effect closure.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

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
    // Intentionally mount-only — the focus grab is a one-shot. Re-seeding
    // focus on every status flip would fight the D-pad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture-phase key interceptor: when controls are hidden, swallow arrow
  // keys (wake-only — spec §4.3) and short-circuit Enter to toggle play/pause
  // (spec §4.3 exception). Also handles media keys (TV remote) and Escape.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape / Back always closes (or closes the topmost popover first).
      if (e.key === "Escape" || e.key === "Back" || e.key === "GoBack") {
        e.preventDefault();
        if (openMenu) {
          setOpenMenu(null);
        } else {
          onClose();
        }
        return;
      }

      // Media keys + keyboard shortcuts — YouTube-style bindings. These work
      // regardless of visibility because they're explicit "do thing" keys,
      // not navigation.
      if (e.key === "MediaPlayPause" || e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlayPause();
        wake();
        return;
      }
      if ((e.key === "MediaRewind" || e.key === "j") && !isLive) {
        e.preventDefault();
        onSeek(currentTime - 10);
        wake();
        return;
      }
      if ((e.key === "MediaFastForward" || e.key === "l") && !isLive) {
        e.preventDefault();
        onSeek(currentTime + 10);
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
          // Wake-only: swallow this press so norigin doesn't navigate.
          // The next press registers normally.
          e.preventDefault();
          e.stopPropagation();
          wake();
          return;
        }
        if (isEnter) {
          // Spec §4.3: Enter while hidden short-circuits pause/play regardless
          // of whichever control was last focused. Block norigin from also
          // firing the focused button's onEnter (would double-toggle).
          e.preventDefault();
          e.stopPropagation();
          togglePlayPause();
          wake();
          return;
        }
      } else {
        // Visible: any key resets the idle timer. Let norigin handle nav.
        if (isArrow || isEnter) wake();
      }
    };

    const onMouseMove = () => wake();

    // Capture phase so we can preempt norigin's window listener.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [onClose, onSeek, currentTime, isLive, openMenu, togglePlayPause, wake]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Focusables for top bar ────────────────────────────────────────────────

  const { ref: backRef, focused: backFocused } = useFocusable({
    focusKey: FK.BACK,
    onEnterPress: onClose,
    onArrowPress: (direction) => {
      // Down from Back → Play/Pause (spec §4.2 — predictable return).
      // Up/Left/Right are no-ops (nothing to navigate to).
      if (direction === "down") {
        setFocus(FK.PLAY_PAUSE);
        return false;
      }
      return false;
    },
  });

  // ── Control bar button handlers ──────────────────────────────────────────

  const handleSeekBack = useCallback(() => onSeek(currentTime - 10), [onSeek, currentTime]);
  const handleSeekForward = useCallback(() => onSeek(currentTime + 10), [onSeek, currentTime]);
  const openAudio = useCallback(() => setOpenMenu((m) => (m === "audio" ? null : "audio")), []);
  const openSubs = useCallback(() => setOpenMenu((m) => (m === "subtitles" ? null : "subtitles")), []);
  const openQuality = useCallback(() => setOpenMenu((m) => (m === "quality" ? null : "quality")), []);

  // ── Adaptive control focusability ─────────────────────────────────────────
  // Spec §3: disabled controls use focusable:false so D-pad walks past them.
  //   Live: no ±10s (can't seek a live stream without a buffer window).
  //   All kinds in 6a: Play/Pause is always the left edge (prev/next deferred).
  //   Quality is the right edge — right-nav blocked there.
  //   Volume / Audio / Subs are always focusable; their popovers are empty
  //   when no data but the button itself should still accept Enter.

  const seekable = !isLive;
  const audioHasOptions = audioTracks.length > 1;
  const subsAvailable = subtitleTracks.length > 0;
  const qualityAvailable = levels.length > 0;

  // Compute the rightmost focusable control so we know who should block the
  // Right edge (spec §4.2: no wrap). Walk the list in visual order.
  const orderedKeys: string[] = [
    FK.PLAY_PAUSE,
    seekable ? FK.SEEK_BACK : null,
    seekable ? FK.SEEK_FORWARD : null,
    FK.VOLUME,
    audioHasOptions ? FK.AUDIO : null,
    subsAvailable ? FK.SUBTITLES : null,
    qualityAvailable ? FK.QUALITY : null,
  ].filter((k): k is NonNullable<typeof k> => k !== null);
  const leftEdgeKey = orderedKeys[0];
  const rightEdgeKey = orderedKeys[orderedKeys.length - 1];

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
          transition: `opacity ${FADE_MS}ms ease-out`,
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
          {/* Scrubber band — hidden on Live (LIVE badge renders in top bar). */}
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
            <ControlButton
              focusKey={FK.PLAY_PAUSE}
              label={isPlaying ? "Pause" : "Play"}
              icon={isPlaying ? "⏸" : "▶"}
              onPress={togglePlayPause}
              isEdgeLeft={leftEdgeKey === FK.PLAY_PAUSE}
              isEdgeRight={rightEdgeKey === FK.PLAY_PAUSE}
            />

            <ControlButton
              focusKey={FK.SEEK_BACK}
              label="Back 10 seconds"
              icon="◀◀"
              focusable={seekable}
              onPress={handleSeekBack}
              isEdgeLeft={leftEdgeKey === FK.SEEK_BACK}
              isEdgeRight={rightEdgeKey === FK.SEEK_BACK}
            />
            <ControlButton
              focusKey={FK.SEEK_FORWARD}
              label="Forward 10 seconds"
              icon="▶▶"
              focusable={seekable}
              onPress={handleSeekForward}
              isEdgeLeft={leftEdgeKey === FK.SEEK_FORWARD}
              isEdgeRight={rightEdgeKey === FK.SEEK_FORWARD}
            />

            {/* Spacer pushes the right-hand selectors to the edge */}
            <div style={{ flex: 1 }} />

            <ControlButton
              focusKey={FK.VOLUME}
              label={muted ? "Unmute" : "Mute"}
              icon={volumeIcon(volume, muted)}
              onPress={onToggleMute}
              isEdgeLeft={leftEdgeKey === FK.VOLUME}
              isEdgeRight={rightEdgeKey === FK.VOLUME}
            />

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
                          setOpenMenu(null);
                        }}
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
                />
                {openMenu === "subtitles" && (
                  <ul style={menuStyle} role="listbox" aria-label="Subtitles">
                    <MenuItem
                      label="Off"
                      isActive={currentSubtitleTrack === -1}
                      focusKey="PLAYER_SUBTITLES_OFF"
                      onSelect={() => {
                        onSelectSubtitleTrack(-1);
                        setOpenMenu(null);
                      }}
                    />
                    {subtitleTracks.map((track) => (
                      <MenuItem
                        key={track.index}
                        label={track.name || track.lang || `Sub ${track.index}`}
                        isActive={currentSubtitleTrack === track.index}
                        focusKey={`PLAYER_SUBTITLE_${track.index}`}
                        onSelect={() => {
                          onSelectSubtitleTrack(track.index);
                          setOpenMenu(null);
                        }}
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
                />
                {openMenu === "quality" && (
                  <ul style={menuStyle} role="listbox" aria-label="Quality">
                    <MenuItem
                      label="Auto"
                      isActive={currentLevel === -1}
                      focusKey="PLAYER_QUALITY_AUTO"
                      onSelect={() => {
                        onSelectLevel(-1);
                        setOpenMenu(null);
                      }}
                    />
                    {/* Spec §5.3: highest-first (most common intent = "lower it") */}
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
                            setOpenMenu(null);
                          }}
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
