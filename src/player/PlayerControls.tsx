/**
 * PlayerControls — overlay UI for the video player.
 *
 * Constraints (v3):
 *  - position: absolute inside PlayerShell — NOT fixed (avoid transform-ancestor breakage).
 *  - No transition-all, no Framer Motion, no backdrop-filter (TV perf).
 *  - Auto-hides after 3s of no input; reappears on any key/mouse event.
 *  - D-pad seek: ArrowLeft = -10s, ArrowRight = +10s.
 *  - Copper focus outline via .focus-ring.
 */
import type { RefObject } from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useFocusable, FocusContext } from "@noriginmedia/norigin-spatial-navigation";
import type { HlsLevel, HlsAudioTrack, HlsSubtitleTrack } from "./useHlsPlayer";

const AUTO_HIDE_MS = 3000;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// ─── Menu overlay (quality / audio / subtitles) ──────────────────────────────

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
    <li style={{ listStyle: "none" }}>
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

// ─── PlayerControls ──────────────────────────────────────────────────────────

export interface PlayerControlsProps {
  title: string;
  status: "idle" | "loading" | "playing" | "paused" | "buffering" | "seeking" | "error";
  currentTime: number;
  duration: number;
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
  onSelectLevel: (idx: number) => void;
  onSelectAudioTrack: (idx: number) => void;
  onSelectSubtitleTrack: (idx: number) => void;
}

export function PlayerControls({
  title,
  status,
  currentTime,
  duration,
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
  onSelectLevel,
  onSelectAudioTrack,
  onSelectSubtitleTrack,
}: PlayerControlsProps) {
  const [visible, setVisible] = useState(true);
  const [openMenu, setOpenMenu] = useState<"quality" | "audio" | "subtitles" | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { ref: containerRef, focusKey } = useFocusable({
    focusKey: "PLAYER_CONTROLS",
  });

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setOpenMenu(null);
    }, AUTO_HIDE_MS);
  }, []);

  const showControls = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Wire keyboard events for D-pad seek + auto-show
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      showControls();

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onSeek(currentTime - 10);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onSeek(currentTime + 10);
      } else if (e.key === "Escape" || e.key === "Back" || e.key === "GoBack") {
        e.preventDefault();
        if (openMenu) {
          setOpenMenu(null);
        } else {
          onClose();
        }
      }
    };
    const handleMouseMove = () => showControls();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [currentTime, onSeek, onClose, openMenu, showControls]);

  // Start auto-hide on mount
  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [scheduleHide]);

  const isPlaying = status === "playing";
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const togglePlayPause = () => {
    showControls();
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  const { ref: playPauseRef } = useFocusable({
    focusKey: "PLAYER_PLAY_PAUSE",
    onEnterPress: togglePlayPause,
  });

  const { ref: qualityRef } = useFocusable({
    focusKey: "PLAYER_QUALITY",
    onEnterPress: () => {
      showControls();
      setOpenMenu((m) => (m === "quality" ? null : "quality"));
    },
  });

  const { ref: audioRef } = useFocusable({
    focusKey: "PLAYER_AUDIO",
    onEnterPress: () => {
      showControls();
      setOpenMenu((m) => (m === "audio" ? null : "audio"));
    },
  });

  const { ref: subtitlesRef } = useFocusable({
    focusKey: "PLAYER_SUBTITLES",
    onEnterPress: () => {
      showControls();
      setOpenMenu((m) => (m === "subtitles" ? null : "subtitles"));
    },
  });

  if (!visible) {
    return null;
  }

  return (
    <FocusContext.Provider value={focusKey}>
      {/* Controls container — position: absolute inside PlayerShell (NOT fixed) */}
      <div
        ref={containerRef as RefObject<HTMLDivElement>}
        data-testid="player-controls"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)",
          padding: "var(--space-6)",
          boxSizing: "border-box",
        }}
      >
        {/* Title */}
        <p
          style={{
            margin: "0 0 var(--space-4) 0",
            fontSize: "var(--text-title-size)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </p>

        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Video progress"
          style={{
            height: "4px",
            background: "rgba(255,255,255,0.2)",
            borderRadius: "2px",
            marginBottom: "var(--space-3)",
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

        {/* Time + Controls row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
          }}
        >
          {/* Play/Pause */}
          <button
            ref={playPauseRef as RefObject<HTMLButtonElement>}
            type="button"
            className="focus-ring"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlayPause}
            style={controlButtonStyle}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          {/* Time display */}
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              fontSize: "var(--text-label-size)",
              color: "var(--text-secondary)",
            }}
          >
            {formatTime(currentTime)}
            {duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </span>

          {/* Status badge */}
          {(status === "buffering" || status === "loading") && (
            <span
              aria-live="polite"
              style={{
                fontSize: "var(--text-label-size)",
                color: "var(--accent-copper)",
                letterSpacing: "var(--text-label-tracking)",
                textTransform: "uppercase",
              }}
            >
              Buffering…
            </span>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Quality switcher */}
          {levels.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                ref={qualityRef as RefObject<HTMLButtonElement>}
                type="button"
                className="focus-ring"
                aria-label="Quality"
                aria-haspopup="listbox"
                aria-expanded={openMenu === "quality"}
                onClick={() => {
                  showControls();
                  setOpenMenu((m) => (m === "quality" ? null : "quality"));
                }}
                style={controlButtonStyle}
              >
                {currentLevel >= 0 && levels[currentLevel]
                  ? levels[currentLevel]!.name
                  : "Auto"}
              </button>
              {openMenu === "quality" && (
                <ul style={menuStyle}>
                  <MenuItem
                    label="Auto"
                    isActive={currentLevel === -1}
                    focusKey="PLAYER_QUALITY_AUTO"
                    onSelect={() => {
                      onSelectLevel(-1);
                      setOpenMenu(null);
                    }}
                  />
                  {levels.map((level) => (
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

          {/* Audio track switcher */}
          {audioTracks.length > 1 && (
            <div style={{ position: "relative" }}>
              <button
                ref={audioRef as RefObject<HTMLButtonElement>}
                type="button"
                className="focus-ring"
                aria-label="Audio track"
                aria-haspopup="listbox"
                aria-expanded={openMenu === "audio"}
                onClick={() => {
                  showControls();
                  setOpenMenu((m) => (m === "audio" ? null : "audio"));
                }}
                style={controlButtonStyle}
              >
                {currentAudioTrack >= 0 && audioTracks[currentAudioTrack]
                  ? audioTracks[currentAudioTrack]!.name
                  : "Audio"}
              </button>
              {openMenu === "audio" && (
                <ul style={menuStyle}>
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

          {/* Subtitle switcher */}
          {subtitleTracks.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                ref={subtitlesRef as RefObject<HTMLButtonElement>}
                type="button"
                className="focus-ring"
                aria-label="Subtitles"
                aria-haspopup="listbox"
                aria-expanded={openMenu === "subtitles"}
                onClick={() => {
                  showControls();
                  setOpenMenu((m) => (m === "subtitles" ? null : "subtitles"));
                }}
                style={controlButtonStyle}
              >
                {currentSubtitleTrack >= 0 && subtitleTracks[currentSubtitleTrack]
                  ? subtitleTracks[currentSubtitleTrack]!.name
                  : "Subtitles"}
              </button>
              {openMenu === "subtitles" && (
                <ul style={menuStyle}>
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

          {/* Close button */}
          <button
            type="button"
            className="focus-ring"
            aria-label="Close player"
            onClick={onClose}
            style={controlButtonStyle}
          >
            ✕
          </button>
        </div>
      </div>
    </FocusContext.Provider>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const controlButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  color: "var(--text-primary)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-2) var(--space-3)",
  cursor: "pointer",
  fontSize: "var(--text-body-size)",
  minWidth: "36px",
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + var(--space-2))",
  right: 0,
  background: "var(--bg-elevated)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-2)",
  margin: 0,
  minWidth: "120px",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  zIndex: 10,
  listStyle: "none",
};
