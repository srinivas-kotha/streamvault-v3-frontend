/**
 * useHlsPlayer — wraps hls.js for HLS + native playback.
 *
 * Design decisions (v3):
 *  - backBufferLength: 20 — reduces memory pressure on Fire TV; do NOT raise.
 *  - Use nextLevel (NOT currentLevel) for quality changes — avoids mid-segment
 *    cuts (lesson from v2 Sprint 4).
 *  - Supports plain MP4/native formats via canPlayType fallback.
 *  - Cleans up hls.destroy() on unmount to prevent memory leaks.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

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
}

export function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  src: string | undefined,
): UseHlsPlayerReturn {
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [levels, setLevels] = useState<HlsLevel[]>([]);
  const [audioTracks, setAudioTracks] = useState<HlsAudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<HlsSubtitleTrack[]>([]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    setError(null);
    setLevels([]);
    setAudioTracks([]);
    setSubtitleTracks([]);

    const isHls = src.includes(".m3u8") || src.includes("/stream/");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        backBufferLength: 20,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
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
        video.play().catch(() => {
          // autoplay blocked — user must press play manually
        });
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
    } else if (video.canPlayType("application/vnd.apple.mpegurl") && isHls) {
      // Safari native HLS
      video.src = src;
      video.load();
    } else {
      // Plain MP4 or other native format
      video.src = src;
      video.load();
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
      video.src = "";
    };
  }, [videoRef, src]);

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

  const selectAudioTrack = useCallback((idx: number) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = idx;
    }
  }, []);

  const selectSubtitleTrack = useCallback((idx: number) => {
    if (hlsRef.current) {
      // -1 = off; >=0 = enable track
      hlsRef.current.subtitleTrack = idx;
    }
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
  };
}
