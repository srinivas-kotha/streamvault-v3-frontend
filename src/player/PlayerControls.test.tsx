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
  };
});

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

  it("first Enter on seek fires single ±10s; held Enter starts 30s interval", () => {
    const onSeek = vi.fn() as Mock;
    const props = makeProps({ currentTime: 120, onSeek });
    render(<PlayerControls {...props} />);

    act(() => pressEnter("PLAYER_SEEK_BACK", 1));
    expect(onSeek).toHaveBeenNthCalledWith(1, 110);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onSeek).toHaveBeenNthCalledWith(2, 90);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onSeek).toHaveBeenNthCalledWith(3, 90);

    act(() => releaseEnter("PLAYER_SEEK_BACK"));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onSeek).toHaveBeenCalledTimes(3);
  });

  it("Enter auto-repeat (pressedKeys.enter > 1) does NOT double-fire the initial seek", () => {
    const onSeek = vi.fn() as Mock;
    render(<PlayerControls {...makeProps({ currentTime: 60, onSeek })} />);

    act(() => pressEnter("PLAYER_SEEK_FORWARD", 1));
    expect(onSeek).toHaveBeenCalledTimes(1);

    act(() => pressEnter("PLAYER_SEEK_FORWARD", 2));
    act(() => pressEnter("PLAYER_SEEK_FORWARD", 3));
    expect(onSeek).toHaveBeenCalledTimes(1);

    act(() => releaseEnter("PLAYER_SEEK_FORWARD"));
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
});
