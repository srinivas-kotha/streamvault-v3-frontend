/**
 * PlayerControls unit tests — Phase 6b shape.
 *
 * Covers 6a behavior plus: volume slider popover opens on Enter, hold-to-scrub
 * fires 30s interval jumps, popover items dismiss on Left/Right and advance
 * to a sibling control (spec §5).
 */
import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { PlayerControls } from "./PlayerControls";
import type { PlayerControlsProps } from "./PlayerControls";
import type { ReactNode } from "react";

// ─── Mock norigin ─────────────────────────────────────────────────────────────
//
// The mock captures the last onEnterPress / onEnterRelease per focusKey so
// tests can invoke them directly — we can't emulate norigin's key routing
// in jsdom, so we drive the handlers synthetically.

type Handlers = {
  onEnterPress?: (props: unknown, details: { pressedKeys: Record<string, number> }) => void;
  onEnterRelease?: (props: unknown) => void;
  onArrowPress?: (
    dir: string,
    props: unknown,
    details: { pressedKeys: Record<string, number> },
  ) => boolean;
  focusable?: boolean;
};

const handlersByKey: Record<string, Handlers> = {};

vi.mock("@noriginmedia/norigin-spatial-navigation", () => {
  const useFocusable = vi.fn(
    ({
      focusKey,
      onEnterPress,
      onEnterRelease,
      onArrowPress,
      focusable = true,
    }: {
      focusKey?: string;
      onEnterPress?: (p: unknown, d: { pressedKeys: Record<string, number> }) => void;
      onEnterRelease?: (p: unknown) => void;
      onArrowPress?: (
        d: string,
        p: unknown,
        dt: { pressedKeys: Record<string, number> },
      ) => boolean;
      focusable?: boolean;
    } = {}) => {
      if (focusKey) {
        handlersByKey[focusKey] = {
          ...(onEnterPress !== undefined ? { onEnterPress } : {}),
          ...(onEnterRelease !== undefined ? { onEnterRelease } : {}),
          ...(onArrowPress !== undefined ? { onArrowPress } : {}),
          focusable,
        };
      }
      return {
        ref: { current: null },
        focused: false,
        focusKey: focusKey ?? "MOCK_KEY",
        hasFocusedChild: false,
      };
    },
  );
  return {
    useFocusable,
    FocusContext: {
      Provider: ({ children }: { children: ReactNode }) => children,
    },
    setFocus: vi.fn(),
    getCurrentFocusKey: () => currentFocusKey,
  };
});

// The window-level arrow-hold logic calls getCurrentFocusKey to gate on
// the transport row. Tests that need hold behavior set this before firing
// the keydown; default is null (off the transport row → hold no-ops).
let currentFocusKey: string | null = null;

function pressEnter(focusKey: string, count = 1) {
  const h = handlersByKey[focusKey];
  if (!h?.onEnterPress) throw new Error(`No onEnterPress for ${focusKey}`);
  h.onEnterPress({}, { pressedKeys: { enter: count } });
}

function releaseEnter(focusKey: string) {
  const h = handlersByKey[focusKey];
  if (h?.onEnterRelease) h.onEnterRelease({});
}

function pressArrow(focusKey: string, direction: "up" | "down" | "left" | "right") {
  const h = handlersByKey[focusKey];
  if (!h?.onArrowPress) return true;
  return h.onArrowPress(direction, {}, { pressedKeys: { [direction]: 1 } });
}

// ─── Default props ────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<PlayerControlsProps> = {}): PlayerControlsProps {
  return {
    title: "Test Title",
    kind: "vod",
    status: "playing",
    currentTime: 30,
    duration: 120,
    volume: 0.5,
    levels: [],
    audioTracks: [],
    subtitleTracks: [],
    currentLevel: -1,
    currentAudioTrack: -1,
    currentSubtitleTrack: -1,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onSeek: vi.fn(),
    onClose: vi.fn(),
    onSetVolume: vi.fn(),
    onSelectLevel: vi.fn(),
    onSelectAudioTrack: vi.fn(),
    onSelectSubtitleTrack: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PlayerControls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const k of Object.keys(handlersByKey)) delete handlersByKey[k];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders Play/Pause, Back button, and title on mount (spec §4.1)", () => {
    render(<PlayerControls {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByText("Test Title")).toBeTruthy();
  });

  it("shows Play label when paused", () => {
    render(<PlayerControls {...makeProps({ status: "paused" })} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("auto-hides controls after 3s idle", () => {
    render(<PlayerControls {...makeProps()} />);
    const el = screen.getByTestId("player-controls");
    expect(el.getAttribute("aria-hidden")).toBe("false");
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("wakes on first arrow without firing navigation", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(screen.getByTestId("player-controls").getAttribute("aria-hidden")).toBe(
      "false",
    );
    expect(props.onSeek).not.toHaveBeenCalled();
  });

  it("Enter short-circuits pause even when hidden", () => {
    const props = makeProps({ status: "playing" });
    render(<PlayerControls {...props} />);
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(props.onPause).toHaveBeenCalledOnce();
  });

  it("j / l seek ±10s on VOD, disabled on Live", () => {
    const vodProps = makeProps({ kind: "vod", currentTime: 30 });
    const { unmount } = render(<PlayerControls {...vodProps} />);
    act(() => fireEvent.keyDown(window, { key: "j" }));
    expect(vodProps.onSeek).toHaveBeenCalledWith(20);
    unmount();

    const liveProps = makeProps({ kind: "live", currentTime: 30 });
    render(<PlayerControls {...liveProps} />);
    act(() => fireEvent.keyDown(window, { key: "l" }));
    expect(liveProps.onSeek).not.toHaveBeenCalled();
  });

  it("Escape closes popover first, player second", () => {
    const levels = [{ index: 0, height: 720, bitrate: 2e6, name: "720p" }];
    const props = makeProps({ levels });
    render(<PlayerControls {...props} />);

    act(() => {
      screen.getByRole("button", { name: /quality/i }).click();
    });
    expect(screen.getByRole("button", { name: "720p" })).toBeTruthy();

    act(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen.queryByRole("button", { name: "720p" })).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();

    act(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("renders ● Live badge + no scrubber on Live kind", () => {
    const { container } = render(<PlayerControls {...makeProps({ kind: "live" })} />);
    expect(screen.getByLabelText("Live")).toBeTruthy();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  it("skips ±10s buttons (focusable:false) on Live", () => {
    render(<PlayerControls {...makeProps({ kind: "live" })} />);
    expect(
      screen.getByRole("button", { name: "Back 10 seconds" }).getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Forward 10 seconds" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  // ─── 6b: hold-to-scrub ──────────────────────────────────────────────────

  it("first Enter on seek button fires single ±10s (tap-rate base step)", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ currentTime: 120, onSeek })} />);

    act(() => pressEnter("PLAYER_SEEK_BACK", 1));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenLastCalledWith(110);

    act(() => releaseEnter("PLAYER_SEEK_BACK"));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onSeek).toHaveBeenCalledTimes(1);
  });

  // ─── 6b: volume slider ──────────────────────────────────────────────────

  it("volume button opens the slider popover", () => {
    render(<PlayerControls {...makeProps({ volume: 0.5 })} />);
    act(() => {
      screen.getByRole("button", { name: "Volume" }).click();
    });
    expect(screen.getByRole("slider", { name: "Volume" })).toBeTruthy();
  });

  it("slider Up arrow calls onSetVolume with +5%", () => {
    const onSetVolume = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ volume: 0.5, onSetVolume })} />);
    act(() => {
      screen.getByRole("button", { name: "Volume" }).click();
    });
    act(() => pressArrow("PLAYER_VOLUME_SLIDER", "up"));
    expect(onSetVolume).toHaveBeenCalledWith(0.55);
  });

  it("slider Down arrow calls onSetVolume with -5%, clamped to 0", () => {
    const onSetVolume = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ volume: 0.03, onSetVolume })} />);
    act(() => {
      screen.getByRole("button", { name: "Volume" }).click();
    });
    act(() => pressArrow("PLAYER_VOLUME_SLIDER", "down"));
    expect(onSetVolume).toHaveBeenCalledWith(0);
  });

  it("slider auto-closes after 2s idle", () => {
    render(<PlayerControls {...makeProps({ volume: 0.5 })} />);
    act(() => {
      screen.getByRole("button", { name: "Volume" }).click();
    });
    expect(screen.queryByRole("slider", { name: "Volume" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByRole("slider", { name: "Volume" })).toBeNull();
  });

  // ─── 6b: popover list-walk + Left/Right dismiss ─────────────────────────

  it("quality popover Left arrow closes popover and advances left (spec §5)", () => {
    const levels = [{ index: 0, height: 720, bitrate: 2e6, name: "720p" }];
    render(<PlayerControls {...makeProps({ levels })} />);
    act(() => {
      screen.getByRole("button", { name: /quality/i }).click();
    });
    expect(screen.getByRole("button", { name: "720p" })).toBeTruthy();

    act(() => pressArrow("PLAYER_QUALITY_AUTO", "left"));
    expect(screen.queryByRole("button", { name: "720p" })).toBeNull();
  });

  it("subtitles popover renders Off + tracks", () => {
    const subtitleTracks = [
      { index: 0, name: "English", lang: "en" },
      { index: 1, name: "Telugu", lang: "te" },
    ];
    render(<PlayerControls {...makeProps({ subtitleTracks })} />);
    act(() => {
      screen.getByRole("button", { name: /subtitles/i }).click();
    });
    expect(screen.getByRole("button", { name: "Off" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Telugu" })).toBeTruthy();
  });

  it("quality popover selects a level + closes", () => {
    const onSelectLevel = vi.fn() as Mock;
    const levels = [
      { index: 0, height: 720, bitrate: 2e6, name: "720p" },
      { index: 1, height: 1080, bitrate: 4e6, name: "1080p" },
    ];
    render(<PlayerControls {...makeProps({ levels, onSelectLevel })} />);
    act(() => {
      screen.getByRole("button", { name: /quality/i }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "720p" }).click();
    });
    expect(onSelectLevel).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("button", { name: "720p" })).toBeNull();
  });

  it("audio popover hidden when only one track", () => {
    render(
      <PlayerControls
        {...makeProps({ audioTracks: [{ index: 0, name: "English", lang: "en" }] })}
      />,
    );
    expect(screen.queryByRole("button", { name: /audio/i })).toBeNull();
  });

  // ─── 6c: prev/next wiring ───────────────────────────────────────────────

  it("renders Previous/Next episode buttons when onPrev/onNext provided (series)", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <PlayerControls
        {...makeProps({ kind: "series-episode", onPrev, onNext })}
      />,
    );
    expect(screen.getByRole("button", { name: "Previous episode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next episode" })).toBeTruthy();
  });

  it("hides Previous/Next when props not provided (movies)", () => {
    render(<PlayerControls {...makeProps({ kind: "vod" })} />);
    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /next episode|next channel/i })).toBeNull();
  });

  it("Previous button fires onPrev when pressed", () => {
    const onPrev = vi.fn();
    render(
      <PlayerControls {...makeProps({ kind: "series-episode", onPrev })} />,
    );
    act(() => {
      screen.getByRole("button", { name: "Previous episode" }).click();
    });
    expect(onPrev).toHaveBeenCalledOnce();
  });

  // ─── 6d: arrow-seek on transport buttons (prod feedback) ────────────────

  it("ArrowLeft on Play/Pause seeks -10s on VOD", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 120, onSeek })} />);
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "left"));
    expect(onSeek).toHaveBeenCalledWith(110);
  });

  it("ArrowRight on Play/Pause seeks +10s on VOD", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 120, onSeek })} />);
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenCalledWith(130);
  });

  it("ArrowLeft on Play/Pause does NOT seek on Live (falls through to nav)", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "live", currentTime: 120, onSeek })} />);
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "left"));
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("ArrowLeft on the SeekBack button seeks -10s (consistent with Play/Pause)", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 200, onSeek })} />);
    act(() => pressArrow("PLAYER_SEEK_BACK", "left"));
    expect(onSeek).toHaveBeenCalledWith(190);
  });

  // ─── Tap-rate accelerator (spec §3.2) ────────────────────────────────────
  //
  // After two failed attempts (PRs #110 / #115) at hold-timer FF, prod
  // feedback 2026-04-25: "click click click for every 10 seconds." Silk on
  // Fire TV emits held d-pad as rapid keydown+keyup pairs; the timer-based
  // model never fires reliably. Replaced with rate-aware delta on each tap:
  // 1–2 taps in 1s → ±10s, 3–5 → ±30s, 6+ → ±60s. Direction reset clears
  // the window so an over-shoot doesn't snap back N×.

  it("first ArrowRight tap on Play/Pause seeks +10s (1× rate)", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 100, onSeek })} />);
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenCalledWith(110);
  });

  // currentTime prop is frozen at 100 across all taps in these tests (the
  // production player would advance it via the timeupdate handler between
  // taps); the assertions below check ONLY the per-tap delta the rate
  // accelerator chose, not the cumulative position.
  it("3 rapid ArrowRight taps escalate the third to +30s (3× rate)", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 100, onSeek })} />);
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenLastCalledWith(110); // 1× = +10
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenLastCalledWith(110); // still 1× (2 taps in window) = +10
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenLastCalledWith(130); // 3 taps in window → 3× = +30
  });

  it("6 rapid ArrowRight taps escalate the sixth to +60s (6× rate)", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 100, onSeek })} />);
    for (let i = 0; i < 5; i += 1) act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenLastCalledWith(160); // 6 taps → 6× = +60
  });

  it("changing direction (Right→Left) resets the rate to 1× / -10s", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 100, onSeek })} />);
    for (let i = 0; i < 4; i += 1) act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenLastCalledWith(130); // 4th tap still 3× = +30
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "left"));
    expect(onSeek).toHaveBeenLastCalledWith(90); // direction flip → window cleared, -10
  });

  it("pause >TAP_WINDOW_MS between taps resets the rate", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 100, onSeek })} />);
    for (let i = 0; i < 3; i += 1) act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenLastCalledWith(130); // 3× by the third tap
    act(() => {
      vi.advanceTimersByTime(1500); // > 1000ms TAP_WINDOW_MS
    });
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(onSeek).toHaveBeenLastCalledWith(110); // back to +10s
  });

  it("ArrowRight on Live falls through (no seek)", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "live", currentTime: 100, onSeek })} />);
    // On live, transportArrowOverrides is empty, so pressArrow returns true
    // (norigin handles it). We assert no seek fired.
    pressArrow("PLAYER_PLAY_PAUSE", "right");
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("Enter on ▶▶ button feeds the same tap-rate accelerator", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ kind: "vod", currentTime: 100, onSeek })} />);
    for (let i = 0; i < 3; i += 1) act(() => pressEnter("PLAYER_SEEK_FORWARD"));
    expect(onSeek).toHaveBeenLastCalledWith(130);
  });

  it("rate badge appears at 3× and is hidden at 1×", () => {
    const onSeek = vi.fn() as Mock;
    const { queryByTestId } = render(
      <PlayerControls {...makeProps({ kind: "vod", currentTime: 100, onSeek })} />,
    );
    expect(queryByTestId("seek-rate-badge")).toBeNull();
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    // 1× → badge stays hidden (multiplier === 1)
    expect(queryByTestId("seek-rate-badge")).toBeNull();
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    expect(queryByTestId("seek-rate-badge")?.textContent).toContain("3×");
  });

  it("rate seek survives a status change mid-burst (no listener teardown)", () => {
    const onSeek = vi.fn() as Mock;
    const { rerender } = render(
      <PlayerControls {...makeProps({ kind: "vod", currentTime: 100, status: "playing", onSeek })} />,
    );
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    rerender(
      <PlayerControls {...makeProps({ kind: "vod", currentTime: 100, status: "seeking", onSeek })} />,
    );
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    rerender(
      <PlayerControls {...makeProps({ kind: "vod", currentTime: 100, status: "playing", onSeek })} />,
    );
    act(() => pressArrow("PLAYER_PLAY_PAUSE", "right"));
    // 3rd tap should escalate to 30 even with status churn between taps.
    expect(onSeek).toHaveBeenLastCalledWith(130);
  });

  // ─── 6e: Prev/Next moved to top bar (UX option 1) ───────────────────────

  it("Prev/Next render in the top bar, not the control bar", () => {
    const { container } = render(
      <PlayerControls
        {...makeProps({ kind: "series-episode", onPrev: vi.fn(), onNext: vi.fn() })}
      />,
    );
    // Buttons still exist and fire their callbacks (no regression on the
    // click-through path); their DOM home is the top bar, not alongside the
    // transport row.
    expect(screen.getByRole("button", { name: "Previous episode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next episode" })).toBeTruthy();
    // The top bar is the FIRST band in the controls; Back sits in it.
    // Verify Prev/Next sit in the same band as Back (not with Play/Pause).
    const backBtn = screen.getByRole("button", { name: "Back" });
    const prevBtn = screen.getByRole("button", { name: "Previous episode" });
    const playBtn = screen.getByRole("button", { name: /pause|play/i });
    expect(backBtn.parentElement).toBe(prevBtn.parentElement);
    expect(prevBtn.parentElement).not.toBe(playBtn.parentElement);
    expect(container).toBeTruthy();
  });

  it("ArrowRight on Back jumps to Prev when onPrev provided", async () => {
    const mod = await import("@noriginmedia/norigin-spatial-navigation");
    const setFocusMock = mod.setFocus as unknown as Mock;
    setFocusMock.mockClear();
    render(
      <PlayerControls
        {...makeProps({ kind: "series-episode", onPrev: vi.fn(), onNext: vi.fn() })}
      />,
    );
    act(() => pressArrow("PLAYER_BACK", "right"));
    expect(setFocusMock).toHaveBeenCalledWith("PLAYER_PREV");
  });

  it("ArrowDown on Prev jumps to Play/Pause", async () => {
    const mod = await import("@noriginmedia/norigin-spatial-navigation");
    const setFocusMock = mod.setFocus as unknown as Mock;
    setFocusMock.mockClear();
    render(
      <PlayerControls {...makeProps({ kind: "series-episode", onPrev: vi.fn() })} />,
    );
    act(() => pressArrow("PLAYER_PREV", "down"));
    expect(setFocusMock).toHaveBeenCalledWith("PLAYER_PLAY_PAUSE");
  });
});
