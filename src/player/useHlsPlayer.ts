/**
 * useHlsPlayer — routes playback to the right library by source kind.
 *
 * Supported formats (2026-04-22 triage — playback was buffering forever
 * because every URL matched `/stream/` and was handed to hls.js even though
 * the backend serves raw MPEG-TS for live and direct MP4/MKV for VOD):
 *
 *  - `kind === "live"` or URL ends in `.ts` / `.m3u8` through /api/stream/live
 *    → mpegts.js (backend transcodes video passthrough + AAC audio to TS)
 *  - URL ends in `.m3u8` from anywhere else → hls.js
 *  - anything else (mp4/mkv/avi VOD) → native `<video src>` — browser handles
 *    Range requests via the backend proxy
 *
 * Design decisions:
 *  - backBufferLength: 20 — reduces memory pressure on Fire TV; do NOT raise.
 *  - maxBufferLength: 120 — 2 min forward target for smoother playback on
 *    flaky networks (2026-04-23 prod feedback). maxMaxBufferLength caps at
 *    180 so hls.js can't grow the buffer indefinitely under adaptive pressure.
 *  - Use nextLevel (NOT currentLevel) for quality changes — avoids mid-segment
 *    cuts (lesson from v2 Sprint 4).
 *  - mpegts.js: enableStashBuffer=false + lowBufferLatencyChasing — live-TV tuned.
 *    Live is deliberately near-live-edge, so the 120 s VOD buffer doesn't
 *    apply; chasing would fight against a deep live buffer anyway.
 *  - Clean up hls.destroy() / mpegts.destroy() on unmount.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import type { PlayerKind } from "./PlayerProvider";

export type PlayerStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "seeking"
  | "error";

export interface HlsLevel {
  index: number;
  height: number;
  bitrate: number;
  name: string;
}

export interface HlsAudioTrack {
  index: number;
  name: string;
  lang: string;
}

export interface HlsSubtitleTrack {
  index: number;
  name: string;
  lang: string;
}

export interface UseHlsPlayerReturn {
  status: PlayerStatus;
  error: Error | null;
  duration: number;
  currentTime: number;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  levels: HlsLevel[];
  audioTracks: HlsAudioTrack[];
  subtitleTracks: HlsSubtitleTrack[];
  selectLevel: (idx: number) => void;
  selectAudioTrack: (idx: number) => void;
  selectSubtitleTrack: (idx: number) => void;
  /** Re-attach the playback engine so a failed stream is retried in place. */
  retry: () => void;
}

export function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  src: string | undefined,
  kind?: PlayerKind,
): UseHlsPlayerReturn {
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<ReturnType<typeof mpegts.createPlayer> | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [levels, setLevels] = useState<HlsLevel[]>([]);
  const [audioTracks, setAudioTracks] = useState<HlsAudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<HlsSubtitleTrack[]>([]);
  // Bumping this forces the main attach/tear-down effect to re-run even when
  // src/kind haven't changed — the "Try again" button on the failure overlay
  // relies on this so users don't have to close + re-open from the card.
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      return;
    }

    setStatus("loading");
    setError(null);
    setLevels([]);
    setAudioTracks([]);
    setSubtitleTracks([]);

    // Decide playback engine. Previous heuristic (`src.includes("/stream/")`)
    // forced EVERY backend URL into hls.js and caused the silent-buffer bug.
    const isM3u8 = src.includes(".m3u8");
    const isLiveTs = kind === "live";
    // VOD / series-episode URLs currently point to /api/stream/vod/:id which
    // proxies a direct MP4/MKV. Browser handles natively.
    const useNative = !isM3u8 && !isLiveTs;

    // When the browser blocks autoplay, `video.play()` rejects silently and
    // the `playing` event never fires — the spinner would otherwise spin
    // forever on a paused video (reported 2026-04-23: "video not playing at
    // all" even though duration loaded). Flip status to "paused" so the
    // Play icon renders and the user can hit Enter.
    const markAutoplayBlocked = () => {
      setStatus((s) => (s === "playing" ? s : "paused"));
    };

    if (isLiveTs && mpegts.getFeatureList().mseLivePlayback) {
      // Live: backend transcodes Xtream TS → video-copy + AAC TS on the wire,
      // mpegts.js wraps MSE for the browser.
      const player = mpegts.createPlayer(
        { type: "mpegts", isLive: true, url: src },
        {
          enableWorker: false,
          enableStashBuffer: false,
          stashInitialSize: 128 * 1024,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 3.0,
          liveBufferLatencyMinRemain: 1.0,
        },
      );
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();
      player.play()?.catch(markAutoplayBlocked);

      player.on(mpegts.Events.ERROR, (errType, errDetail) => {
        setError(new Error(`${errType}: ${errDetail}`));
        setStatus("error");
      });
    } else if (useNative) {
      video.src = src;
      video.load();
      // Native MP4/MKV containers can carry multi-audio (dubbed OTT titles
      // are the common case). `video.audioTracks` is a live AudioTrackList;
      // surface it into our state the same way the HLS path does so the
      // 🎧 picker and auto-select logic work identically.
      // Chromium exposes this; Firefox doesn't — guarded to avoid throwing.
      const nativeAudio = (
        video as HTMLVideoElement & {
          audioTracks?: {
            length: number;
            [i: number]: { id?: string; label?: string; language?: string; enabled?: boolean };
            onaddtrack?: (() => void) | null;
            onchange?: (() => void) | null;
          };
        }
      ).audioTracks;
      if (nativeAudio) {
        const syncNativeAudio = () => {
          const arr: HlsAudioTrack[] = [];
          for (let i = 0; i < nativeAudio.length; i += 1) {
            const t = nativeAudio[i]!;
            arr.push({
              index: i,
              name: t.label || t.language || `Audio ${i}`,
              lang: t.language ?? "",
            });
          }
          setAudioTracks(arr);
        };
        syncNativeAudio();
        nativeAudio.onaddtrack = syncNativeAudio;
      }
      void Promise.resolve(video.play()).catch(markAutoplayBlocked);
    } else if (isM3u8 && Hls.isSupported()) {
      // Phase 6 follow-up (2026-04-23 user ask): bump forward-buffer target
      // to 120 s for smoother playback on flaky networks. backBufferLength
      // stays at 20 s — keeps memory pressure on Fire TV bounded per the
      // v2 lesson.
      const hls = new Hls({
        backBufferLength: 20,
        maxBufferLength: 120,
        maxMaxBufferLength: 180,
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(
          data.levels.map((l, i) => ({
            index: i,
            height: l.height ?? 0,
            bitrate: l.bitrate ?? 0,
            name: l.name ?? (l.height ? `${l.height}p` : `Level ${i}`),
          })),
        );
        video.play().catch(markAutoplayBlocked);
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        setAudioTracks(
          data.audioTracks.map((t, i) => ({
            index: i,
            name: t.name ?? `Audio ${i}`,
            lang: t.lang ?? "",
          })),
        );
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
        setSubtitleTracks(
          data.subtitleTracks.map((t, i) => ({
            index: i,
            name: t.name ?? `Subtitle ${i}`,
            lang: t.lang ?? "",
          })),
        );
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(new Error(data.details ?? "HLS fatal error"));
          setStatus("error");
          hls.destroy();
          hlsRef.current = null;
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl") && isM3u8) {
      // Safari native HLS
      video.src = src;
      video.load();
    } else {
      // Ultimate fallback — hand to the browser. Works for MP4/MKV via Range
      // requests through the backend proxy; also covers the case where
      // mpegts.js says MSE live playback isn't supported.
      video.src = src;
      video.load();
      void Promise.resolve(video.play()).catch(markAutoplayBlocked);
    }

    const onPlay = () => setStatus("playing");
    const onPause = () => setStatus("paused");
    const onWaiting = () => setStatus("buffering");
    const onSeeking = () => setStatus("seeking");
    const onSeeked = () =>
      setStatus(video.paused ? "paused" : "playing");
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration ?? 0);
    const onError = () => {
      const err = video.error;
      setError(new Error(err?.message ?? "Video playback error"));
      setStatus("error");
    };
    const onPlaying = () => setStatus("playing");

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("error", onError);
    video.addEventListener("playing", onPlaying);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("error", onError);
      video.removeEventListener("playing", onPlaying);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        try {
          mpegtsRef.current.destroy();
        } catch {
          /* mpegts may already be torn down */
        }
        mpegtsRef.current = null;
      }
      video.src = "";
    };
  }, [videoRef, src, kind, retryCount]);

  const play = useCallback(() => {
    videoRef.current?.play().catch(() => {});
  }, [videoRef]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const seek = useCallback(
    (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(
          0,
          Math.min(time, videoRef.current.duration || Infinity),
        );
      }
    },
    [videoRef],
  );

  const setVolume = useCallback(
    (v: number) => {
      if (videoRef.current) {
        videoRef.current.volume = Math.max(0, Math.min(1, v));
      }
    },
    [videoRef],
  );

  // Use nextLevel (not currentLevel) to avoid mid-segment quality cuts — v2 lesson.
  const selectLevel = useCallback((idx: number) => {
    if (hlsRef.current) {
      hlsRef.current.nextLevel = idx;
    }
  }, []);

  const selectAudioTrack = useCallback(
    (idx: number) => {
      if (hlsRef.current) {
        hlsRef.current.audioTrack = idx;
        return;
      }
      // Native MP4/MKV: flip `enabled` on the AudioTrackList entries. This
      // API is Chromium-only; on browsers without support the call is a
      // no-op (`audioTracks` is undefined and the guard bails cleanly).
      const v = videoRef.current as
        | (HTMLVideoElement & {
            audioTracks?: {
              length: number;
              [i: number]: { enabled?: boolean };
            };
          })
        | null;
      const list = v?.audioTracks;
      if (!list) return;
      for (let i = 0; i < list.length; i += 1) {
        // eslint-disable-next-line react-hooks/immutability -- videoRef.current.audioTracks is the browser's native track list; toggling .enabled is the supported API for native HLS track selection
        list[i]!.enabled = i === idx;
      }
    },
    [videoRef],
  );

  const selectSubtitleTrack = useCallback((idx: number) => {
    if (hlsRef.current) {
      // -1 = off; >=0 = enable track
      hlsRef.current.subtitleTrack = idx;
    }
  }, []);

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  return {
    status,
    error,
    duration,
    currentTime,
    play,
    pause,
    seek,
    setVolume,
    levels,
    audioTracks,
    subtitleTracks,
    selectLevel,
    selectAudioTrack,
    selectSubtitleTrack,
    retry,
  };
}
