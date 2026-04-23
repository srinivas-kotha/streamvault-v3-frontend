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
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { usePlayerStore } from "./PlayerProvider";
import type { PlayerKind } from "./PlayerProvider";
import { useHlsPlayer } from "./useHlsPlayer";
import { PlayerControls } from "./PlayerControls";
import { useReducedMotion } from "./useReducedMotion";
import { markTierLocked } from "../features/movies/tierLockCache";
import { recordHistory } from "../api/history";
import { getLangPref } from "../lib/langPref";
import { pickAudioTrackForLang } from "../lib/inferLanguage";

// Failure-overlay focus keys — kept local, only the overlay reads them.
const FK_RETRY = "PLAYER_FAIL_RETRY";
const FK_BACK = "PLAYER_FAIL_BACK";

/**
 * Classify a playback error so the overlay can render the right copy and
 * decide whether to memo a tier-lock hit (spec §9.2 / §9.3).
 *
 * Heuristic: VOD/series-episode that errors with zero duration + zero
 * playhead — before any frame ever arrived — is almost always the Xtream
 * account plan refusing the container extension. Live errors are treated
 * as generic (tier-lock doesn't apply to Live channels).
 */
function classifyFailure(
  kind: PlayerKind,
  duration: number,
  currentTime: number,
): "tier-lock" | "generic" {
  if (kind !== "live" && duration === 0 && currentTime === 0) {
    return "tier-lock";
  }
  return "generic";
}

export function PlayerShell() {
  const { state, close } = usePlayerStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useReducedMotion();

  const src = state.status === "open" ? state.src : undefined;
  const title = state.status === "open" ? state.title : "";
  const kind = state.status === "open" ? state.kind : "vod";
  const onPrev = state.status === "open" ? state.onPrev : undefined;
  const onNext = state.status === "open" ? state.onNext : undefined;
  const contentId = state.status === "open" ? state.contentId : undefined;

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
    retry,
  } = useHlsPlayer(videoRef, src, kind);

  const [currentLevel, setCurrentLevel] = useState(-1);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1);
  const [volume, setVolumeState] = useState(1);

  const { ref: shellRef, focusKey } = useFocusable({
    focusKey: "PLAYER_SHELL",
    isFocusBoundary: true,
  });

  // Reset track selections whenever the source changes. This IS the external
  // sync — src is the upstream, currentLevel/Audio/Subtitle are derived state
  // that must reset when it flips. React's set-state-in-effect rule flags it,
  // but there's no alternative: these track indices are owned by the HLS
  // engine, not by the src prop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resync derived state with src
    setCurrentLevel(-1);
    setCurrentAudioTrack(-1);
    setCurrentSubtitleTrack(-1);
  }, [src]);

  // Auto-select audio to match the user's language pref (sv_lang_pref) on
  // the first track list that arrives for a given stream. Fires once per
  // open; manual selections in the 🎧 menu take over after that.
  //
  // Rationale: OTT titles (Hotstar / Netflix / Zee5) often ship multi-audio
  // HLS. Before this, a Telugu user landing in "Panchayat" heard the default
  // Hindi track and had to dig through the menu on every episode. The
  // language rail already tells us which track they want — honour it.
  const autoSelectedForSrcRef = useRef<string | null>(null);
  useEffect(() => {
    if (!src) {
      autoSelectedForSrcRef.current = null;
      return;
    }
    if (autoSelectedForSrcRef.current === src) return;
    if (audioTracks.length < 2) return; // single-track: nothing to pick
    const pref = getLangPref();
    const idx = pickAudioTrackForLang(audioTracks, pref);
    if (idx < 0) {
      // No meaningful match. Mark as done so we don't retry on every
      // track-list update; user can pick manually.
      autoSelectedForSrcRef.current = src;
      return;
    }
    autoSelectedForSrcRef.current = src;
    selectAudioTrack(idx);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: mirror HLS engine selection back into local state
    setCurrentAudioTrack(idx);
  }, [src, audioTracks, selectAudioTrack]);

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

  const failureClass =
    status === "error" ? classifyFailure(kind, duration, currentTime) : null;

  // Memo the tier-lock so MovieCard/EpisodeRow can badge the card on return.
  useEffect(() => {
    if (failureClass === "tier-lock" && contentId) {
      markTierLocked(contentId.id);
    }
  }, [failureClass, contentId]);

  // Live progress tracking → watch history.
  //
  // Writes (currentTime, duration, title) every ~15 s of playback so the
  // ResumeHero can pick the correct in-progress item and show the full
  // episode/movie title. Without this, history was only ever written on
  // "mark as watched" — legacy rows had content_name = null, producing
  // "Resume your episode" (reported 2026-04-23).
  //
  // Live streams are excluded: the Xtream TS feed has no stable "duration"
  // and there is no resume semantic for live TV.
  const lastWrittenRef = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    if (state.status !== "open") return;
    if (kind === "live") return;
    if (!contentId) return;
    if (!(duration > 0)) return;
    if (!(currentTime > 0)) return;

    const now = Date.now();
    const prev = lastWrittenRef.current;
    const sameItem = prev?.id === contentId.id;
    // Throttle: 15 s between writes per item.
    if (sameItem && now - (prev?.at ?? 0) < 15_000) return;
    lastWrittenRef.current = { id: contentId.id, at: now };

    void recordHistory(Number(contentId.id), {
      content_type: kind === "series-episode" ? "series" : "vod",
      content_name: title,
      progress_seconds: Math.floor(currentTime),
      duration_seconds: Math.floor(duration),
    });
  }, [state.status, kind, contentId, currentTime, duration, title]);

  if (state.status === "idle") {
    return null;
  }

  const showFailure = status === "error";

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
          // Hint to the browser: prefetch as much VOD as possible. Native
          // video buffer size is ultimately browser-controlled, but "auto"
          // tells it not to throttle prefetch. For HLS / mpegts this attr
          // is ignored — those libraries manage their own buffer.
          preload="auto"
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
                animation: reducedMotion
                  ? "sv-pulse 1.6s ease-in-out infinite"
                  : "sv-spin 0.8s linear infinite",
              }}
            />
          </div>
        )}

        {showFailure && (
          <FailureOverlay
            kind={failureClass === "tier-lock" ? "tier-lock" : "generic"}
            onRetry={retry}
            onClose={close}
          />
        )}

        {!showFailure && (
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
            {...(onPrev && { onPrev })}
            {...(onNext && { onNext })}
          />
        )}
      </div>

      <style>{`
        @keyframes sv-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes sv-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </FocusContext.Provider>
  );
}

// ─── FailureOverlay ──────────────────────────────────────────────────────────

interface FailureOverlayProps {
  kind: "tier-lock" | "generic";
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Amber glass overlay per spec §9. Never red, never auto-retry.
 *
 *   tier-lock → specific "format not supported by plan" copy, no Try again
 *   generic   → Try again + Back to browse
 *
 * Focus: auto-seeds on the most-useful action for the class.
 */
function FailureOverlay({ kind, onRetry, onClose }: FailureOverlayProps) {
  const { ref: retryRef, focused: retryFocused } = useFocusable({
    focusKey: FK_RETRY,
    focusable: kind !== "tier-lock",
    onEnterPress: onRetry,
    onArrowPress: (direction) => {
      if (direction === "right") {
        setFocus(FK_BACK);
        return false;
      }
      return false;
    },
  });

  const { ref: backRef, focused: backFocused } = useFocusable({
    focusKey: FK_BACK,
    onEnterPress: onClose,
    onArrowPress: (direction) => {
      if (direction === "left" && kind !== "tier-lock") {
        setFocus(FK_RETRY);
        return false;
      }
      return false;
    },
  });

  useEffect(() => {
    setFocus(kind === "tier-lock" ? FK_BACK : FK_RETRY);
  }, [kind]);

  // Escape/Back closes; otherwise the generic PlayerControls listener
  // isn't mounted (we're showing the overlay instead).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Back" || e.key === "GoBack") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      data-testid={`player-failure-${kind}`}
      role="alertdialog"
      aria-modal="true"
      aria-label="Playback failed"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.75)",
        padding: "var(--space-6)",
      }}
    >
      <div
        style={{
          maxWidth: "540px",
          width: "100%",
          background: "rgba(245,158,11,0.12)",
          border: "1px solid #F59E0B",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-4)",
          textAlign: "center",
          color: "var(--text-primary)",
        }}
      >
        <span style={{ fontSize: "32px" }} aria-hidden="true">⚠</span>
        <p style={{ fontSize: "var(--text-title-size)", fontWeight: 600, margin: 0 }}>
          Playback failed
        </p>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "var(--text-body-size)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {kind === "tier-lock"
            ? "This title is delivered in a format your Xtream plan doesn't support. Try a different title or see if a similar one is available."
            : "This title couldn't be played right now. It may be a format your plan doesn't support, or the provider is temporarily unavailable."}
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            marginTop: "var(--space-2)",
          }}
        >
          {kind !== "tier-lock" && (
            <button
              ref={retryRef as RefObject<HTMLButtonElement>}
              type="button"
              className="focus-ring"
              onClick={onRetry}
              style={{
                background: retryFocused ? "var(--accent-copper)" : "rgba(255,255,255,0.15)",
                color: retryFocused ? "var(--bg-base)" : "var(--text-primary)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-2) var(--space-6)",
                cursor: "pointer",
                fontSize: "var(--text-body-size)",
              }}
            >
              Try again
            </button>
          )}
          <button
            ref={backRef as RefObject<HTMLButtonElement>}
            type="button"
            className="focus-ring"
            onClick={onClose}
            style={{
              background: backFocused ? "var(--accent-copper)" : "rgba(255,255,255,0.15)",
              color: backFocused ? "var(--bg-base)" : "var(--text-primary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-2) var(--space-6)",
              cursor: "pointer",
              fontSize: "var(--text-body-size)",
            }}
          >
            Back to browse
          </button>
        </div>
      </div>
    </div>
  );
}
