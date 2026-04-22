/**
 * PlayerShell — full-screen singleton video player overlay.
 *
 * Constraints (v3):
 *  - Only renders when playerStore.state.status === "open".
 *  - Single <video> element — NEVER two. The provider gates this.
 *  - NO CSS transform on this element (breaks position:fixed children).
 *  - NO backdrop-filter (TV perf kill).
 *  - NO transition-all.
 *  - Full-screen overlay, no HTML5 controls — we render PlayerControls.
 *  - FocusContext wrapper so D-pad works inside the player.
 */
import type { RefObject } from "react";
import { useRef, useState } from "react";
import { useFocusable, FocusContext } from "@noriginmedia/norigin-spatial-navigation";
import { usePlayerStore } from "./PlayerProvider";
import { useHlsPlayer } from "./useHlsPlayer";
import { PlayerControls } from "./PlayerControls";

export function PlayerShell() {
  const { state, close } = usePlayerStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = state.status === "open" ? state.src : undefined;
  const title = state.status === "open" ? state.title : "";

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
    selectLevel,
    selectAudioTrack,
    selectSubtitleTrack,
  } = useHlsPlayer(videoRef, src);

  const [currentLevel, setCurrentLevel] = useState(-1);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1);

  // Reset track selection when a new src loads — derive from src change
  // by initializing to -1. Actual updates happen via callbacks below.

  const { ref: shellRef, focusKey } = useFocusable({
    focusKey: "PLAYER_SHELL",
    isFocusBoundary: true,
  });

  const handleSelectLevel = (idx: number) => {
    selectLevel(idx);
    setCurrentLevel(idx);
  };

  const handleSelectAudioTrack = (idx: number) => {
    selectAudioTrack(idx);
    setCurrentAudioTrack(idx);
  };

  const handleSelectSubtitleTrack = (idx: number) => {
    selectSubtitleTrack(idx);
    setCurrentSubtitleTrack(idx);
  };

  if (state.status === "idle") {
    return null;
  }

  return (
    <FocusContext.Provider value={focusKey}>
      {/* Full-screen overlay — position: fixed, NO transform, NO backdrop-filter */}
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
        {/* Video element — no HTML5 controls.
            Captions are provided by hls.js subtitle tracks (dynamic).
            eslint-disable-next-line jsx-a11y/media-has-caption */}
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

        {/* Buffering / loading spinner */}
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

        {/* Error state */}
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

        {/* Controls overlay — absolute, NOT fixed */}
        {status !== "error" && (
          <PlayerControls
            title={title}
            status={status}
            currentTime={currentTime}
            duration={duration}
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
            onSelectLevel={handleSelectLevel}
            onSelectAudioTrack={handleSelectAudioTrack}
            onSelectSubtitleTrack={handleSelectSubtitleTrack}
          />
        )}
      </div>

      {/* Spinner keyframe — injected once */}
      <style>{`
        @keyframes sv-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </FocusContext.Provider>
  );
}
