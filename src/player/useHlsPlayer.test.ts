/**
 * useHlsPlayer unit tests.
 *
 * Mocks hls.js to isolate the hook from real HLS parsing.
 * Verifies: attach, load, destroy on unmount, quality switch uses nextLevel.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useHlsPlayer } from "./useHlsPlayer";
import type React from "react";

// ─── Mock hls.js (vi.hoisted to avoid reference-before-init) ─────────────────

const mockHlsInstance = vi.hoisted(() => ({
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  nextLevel: -1,
  audioTrack: -1,
  subtitleTrack: -1,
}));

vi.mock("hls.js", () => {
  // Must use function (not arrow) so it can be called with `new`
  function MockHls() {
    return mockHlsInstance;
  }
  MockHls.isSupported = () => true;
  MockHls.Events = {
    MANIFEST_PARSED: "hlsManifestParsed",
    AUDIO_TRACKS_UPDATED: "hlsAudioTracksUpdated",
    SUBTITLE_TRACKS_UPDATED: "hlsSubtitleTracksUpdated",
    ERROR: "hlsError",
  };
  return { default: MockHls };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createVideoRef() {
  const video = {
    src: "",
    load: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    canPlayType: vi.fn(() => ""),
    currentTime: 0,
    duration: 0,
    volume: 1,
    paused: true,
    error: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return { current: video } as unknown as React.RefObject<HTMLVideoElement>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useHlsPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHlsInstance.nextLevel = -1;
    mockHlsInstance.audioTrack = -1;
    mockHlsInstance.subtitleTrack = -1;
  });

  it("starts with idle status when no src provided", () => {
    const videoRef = createVideoRef();
    const { result } = renderHook(() => useHlsPlayer(videoRef, undefined));
    expect(result.current.status).toBe("idle");
  });

  it("calls loadSource + attachMedia when src is provided", () => {
    const videoRef = createVideoRef();
    const src = "/api/stream/live/123";

    renderHook(() => useHlsPlayer(videoRef, src));

    expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(src);
    expect(mockHlsInstance.attachMedia).toHaveBeenCalledWith(videoRef.current);
  });

  it("registers event listeners on the video element", () => {
    const videoRef = createVideoRef();
    renderHook(() => useHlsPlayer(videoRef, "/api/stream/live/1"));

    const addEventListenerMock = videoRef.current
      ?.addEventListener as unknown as Mock;
    const registeredEvents = addEventListenerMock.mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(registeredEvents).toContain("play");
    expect(registeredEvents).toContain("pause");
    expect(registeredEvents).toContain("waiting");
    expect(registeredEvents).toContain("timeupdate");
    expect(registeredEvents).toContain("durationchange");
  });

  it("calls hls.destroy() on unmount (memory leak prevention)", () => {
    const videoRef = createVideoRef();
    const { unmount } = renderHook(() =>
      useHlsPlayer(videoRef, "/api/stream/live/1"),
    );

    unmount();

    expect(mockHlsInstance.destroy).toHaveBeenCalledOnce();
  });

  it("uses nextLevel (NOT currentLevel) when selectLevel is called", () => {
    const videoRef = createVideoRef();
    const { result } = renderHook(() =>
      useHlsPlayer(videoRef, "/api/stream/live/1"),
    );

    act(() => {
      result.current.selectLevel(2);
    });

    // nextLevel must be set
    expect(mockHlsInstance.nextLevel).toBe(2);
  });

  it("sets audioTrack when selectAudioTrack is called", () => {
    const videoRef = createVideoRef();
    const { result } = renderHook(() =>
      useHlsPlayer(videoRef, "/api/stream/live/1"),
    );

    act(() => {
      result.current.selectAudioTrack(1);
    });

    expect(mockHlsInstance.audioTrack).toBe(1);
  });

  it("sets subtitleTrack when selectSubtitleTrack is called", () => {
    const videoRef = createVideoRef();
    const { result } = renderHook(() =>
      useHlsPlayer(videoRef, "/api/stream/live/1"),
    );

    act(() => {
      result.current.selectSubtitleTrack(0);
    });

    expect(mockHlsInstance.subtitleTrack).toBe(0);
  });

  it("seek clamps currentTime to valid range", () => {
    const videoRef = createVideoRef();
    if (videoRef.current) {
      Object.defineProperty(videoRef.current, "duration", {
        value: 100,
        writable: true,
        configurable: true,
      });
    }

    const { result } = renderHook(() =>
      useHlsPlayer(videoRef, "/api/stream/vod/1"),
    );

    act(() => {
      result.current.seek(50);
    });
    expect(videoRef.current?.currentTime).toBe(50);

    // Clamped to 0
    act(() => {
      result.current.seek(-5);
    });
    expect(videoRef.current?.currentTime).toBe(0);
  });
});
