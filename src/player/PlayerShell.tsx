/**
 * PlayerShell — full-screen singleton video player overlay.
 *
 * Constraints (v3):
 *  - Only renders when playerStore.state.status === "open".
 *  - Single <video> element — NEVER two. The provider gates this.
 *  - NO CSS transform on this element (breaks position:fixed children).
 *  - NO backdrop-filter (TV perf kill).
 *  - NO transition-all.
 *  - Full-screen overlay, no HTML5 controls — PlayerControls owns the UI.
 *  - FocusContext wrapper so D-pad works inside the player.
 */
import type { RefObject } from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { useFocusable, FocusContext } from "@noriginmedia/norigin-spatial-navigation";
import { usePlayerStore } from "./PlayerProvider";
import { useHlsPlayer } from "./useHlsPlayer";
import { PlayerControls } from "./PlayerControls";

export function PlayerShell() {
  const { state, close } = usePlayerStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = state.status === "open" ? state.src : undefined;
  const title = state.status === "open" ? state.title : "";
  const kind = state.status === "open" ? state.kind : "vod";

  const {
    status,
    duration,
    currentTime,
    levels,
    audioTracks,
    subtitleTracks,
    play,
    pause,
    seek,
    setVolume,
    selectLevel,
    selectAudioTrack,
    selectSubtitleTrack,
  } = useHlsPlayer(videoRef, src, kind);

  const [currentLevel, setCurrentLevel] = useState(-1);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1);
  const [volume, setVolumeState] = useState(1);

  const { ref: shellRef, focusKey } = useFocusable({
    focusKey: "PLAYER_SHELL",
    isFocusBoundary: true,
  });

  // Reset track / level state when a new src loads so stale labels don't
  // stick around through channel or episode switches.
  useEffect(() => {
    setCurrentLevel(-1);
    setCurrentAudioTrack(-1);
    setCurrentSubtitleTrack(-1);
  }, [src]);

  const handleSelectLevel = useCallback(
    (idx: number) => {
      selectLevel(idx);
      setCurrentLevel(idx);
    },
    [selectLevel],
  );

  const handleSelectAudioTrack = useCallback(
    (idx: number) => {
      selectAudioTrack(idx);
      setCurrentAudioTrack(idx);
    },
    [selectAudioTrack],
  );

  const handleSelectSubtitleTrack = useCallback(
    (idx: number) => {
      selectSubtitleTrack(idx);
      setCurrentSubtitleTrack(idx);
    },
    [selectSubtitleTrack],
  );

  const handleSetVolume = useCallback(
    (v: number) => {
      setVolumeState(v);
      setVolume(v);
    },
    [setVolume],
  );

  if (state.status === "idle") {
    return null;
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={shellRef as RefObject<HTMLDivElement>}
        data-testid="player-shell"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "#000",
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          data-testid="player-video"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
          playsInline
        />

        {(status === "loading" || status === "buffering") && (
          <div
            aria-label="Loading video"
            aria-live="polite"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                width: "48px",
                height: "48px",
                border: "4px solid rgba(255,255,255,0.2)",
                borderTopColor: "var(--accent-copper)",
                borderRadius: "50%",
                display: "inline-block",
                animation: "sv-spin 0.8s linear infinite",
              }}
            />
          </div>
        )}

        {/* Minimal error state — full amber overlay + tier-lock copy ships in 6c. */}
        {status === "error" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-primary)",
              gap: "var(--space-4)",
            }}
          >
            <p style={{ fontSize: "var(--text-title-size)", fontWeight: 600 }}>
              Playback error
            </p>
            <p style={{ color: "var(--text-secondary)" }}>
              The stream could not be loaded.
            </p>
            <button
              type="button"
              className="focus-ring"
              onClick={close}
              style={{
                background: "var(--accent-copper)",
                color: "var(--bg-base)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-2) var(--space-6)",
                cursor: "pointer",
                fontSize: "var(--text-body-size)",
              }}
            >
              Close
            </button>
          </div>
        )}

        {status !== "error" && (
          <PlayerControls
            title={title}
            kind={kind}
            status={status}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            levels={levels}
            audioTracks={audioTracks}
            subtitleTracks={subtitleTracks}
            currentLevel={currentLevel}
            currentAudioTrack={currentAudioTrack}
            currentSubtitleTrack={currentSubtitleTrack}
            onPlay={play}
            onPause={pause}
            onSeek={seek}
            onClose={close}
            onSetVolume={handleSetVolume}
            onSelectLevel={handleSelectLevel}
            onSelectAudioTrack={handleSelectAudioTrack}
            onSelectSubtitleTrack={handleSelectSubtitleTrack}
          />
        )}
      </div>

      <style>{`
        @keyframes sv-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </FocusContext.Provider>
  );
}
