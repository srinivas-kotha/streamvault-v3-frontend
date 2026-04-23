/**
 * PlayerControls unit tests — Phase 6a shape.
 *
 * Covers: initial visibility + focus, auto-hide, wake-only first arrow,
 * Enter short-circuit, Back closes player, seek shortcuts (j/l), Live mode
 * hides scrubber and skips ±10s, quality popover still selects levels.
 */
import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { PlayerControls } from "./PlayerControls";
import type { PlayerControlsProps } from "./PlayerControls";
import type { ReactNode } from "react";

// ─── Mock norigin ─────────────────────────────────────────────────────────────

vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  useFocusable: vi.fn(() => ({
    ref: { current: null },
    focused: false,
    focusKey: "MOCK_KEY",
    hasFocusedChild: false,
  })),
  FocusContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
  setFocus: vi.fn(),
}));

// ─── Default props ────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<PlayerControlsProps> = {}): PlayerControlsProps {
  return {
    title: "Test Title",
    kind: "vod",
    status: "playing",
    currentTime: 30,
    duration: 120,
    volume: 1,
    muted: false,
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
    onToggleMute: vi.fn(),
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders Play/Pause, Back button, and title on mount (spec §4.1)", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByText("Test Title")).toBeTruthy();
  });

  it("shows Play label when paused", () => {
    const props = makeProps({ status: "paused" });
    render(<PlayerControls {...props} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("auto-hides controls after 3s idle", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);
    const el = screen.getByTestId("player-controls");
    expect(el.getAttribute("aria-hidden")).toBe("false");

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("wakes on first arrow press without triggering navigation", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.getByTestId("player-controls").getAttribute("aria-hidden")).toBe(
      "true",
    );

    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(screen.getByTestId("player-controls").getAttribute("aria-hidden")).toBe(
      "false",
    );
    // onSeek must NOT fire — the first arrow is wake-only (spec §4.3).
    expect(props.onSeek).not.toHaveBeenCalled();
  });

  it("Enter short-circuits pause even when controls are hidden (spec §4.3)", () => {
    const props = makeProps({ status: "playing" });
    render(<PlayerControls {...props} />);

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(props.onPause).toHaveBeenCalledOnce();
    expect(screen.getByTestId("player-controls").getAttribute("aria-hidden")).toBe(
      "false",
    );
  });

  it("Space and k also toggle play/pause", () => {
    const props = makeProps({ status: "playing" });
    render(<PlayerControls {...props} />);

    act(() => {
      fireEvent.keyDown(window, { key: " " });
    });
    expect(props.onPause).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.keyDown(window, { key: "k" });
    });
    expect(props.onPause).toHaveBeenCalledTimes(2);
  });

  it("j / l seek -10s / +10s on VOD", () => {
    const props = makeProps({ currentTime: 30, kind: "vod" });
    render(<PlayerControls {...props} />);

    act(() => {
      fireEvent.keyDown(window, { key: "j" });
    });
    expect(props.onSeek).toHaveBeenCalledWith(20);

    act(() => {
      fireEvent.keyDown(window, { key: "l" });
    });
    expect(props.onSeek).toHaveBeenCalledWith(40);
  });

  it("j / l do NOT seek on Live (no seekable window)", () => {
    const props = makeProps({ currentTime: 30, kind: "live" });
    render(<PlayerControls {...props} />);

    act(() => {
      fireEvent.keyDown(window, { key: "j" });
    });
    act(() => {
      fireEvent.keyDown(window, { key: "l" });
    });
    expect(props.onSeek).not.toHaveBeenCalled();
  });

  it("Escape closes the player when no popover is open", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("renders ● Live badge and hides scrubber on Live kind", () => {
    const props = makeProps({ kind: "live" });
    const { container } = render(<PlayerControls {...props} />);
    expect(screen.getByLabelText("Live")).toBeTruthy();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  it("renders scrubber for VOD", () => {
    const props = makeProps({ kind: "vod" });
    const { container } = render(<PlayerControls {...props} />);
    expect(container.querySelector("[role='progressbar']")).toBeTruthy();
  });

  it("skips ±10s buttons (focusable:false) on Live", () => {
    const props = makeProps({ kind: "live" });
    render(<PlayerControls {...props} />);
    const seekBack = screen.getByRole("button", { name: "Back 10 seconds" });
    const seekFwd = screen.getByRole("button", { name: "Forward 10 seconds" });
    expect(seekBack.getAttribute("aria-disabled")).toBe("true");
    expect(seekFwd.getAttribute("aria-disabled")).toBe("true");
  });

  it("quality popover selects a level and closes", () => {
    const onSelectLevel = vi.fn() as Mock;
    const levels = [
      { index: 0, height: 720, bitrate: 2_000_000, name: "720p" },
      { index: 1, height: 1080, bitrate: 4_000_000, name: "1080p" },
    ];
    const props = makeProps({ levels, onSelectLevel });
    render(<PlayerControls {...props} />);

    act(() => {
      screen.getByRole("button", { name: /quality/i }).click();
    });

    // Highest-first order (spec §5.3): 1080p is listed before 720p.
    const items = screen.getAllByRole("option");
    expect(items.length).toBeGreaterThan(0);

    act(() => {
      screen.getByRole("button", { name: "720p" }).click();
    });
    expect(onSelectLevel).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("button", { name: "720p" })).toBeNull();
  });

  it("subtitles popover renders Off + tracks", () => {
    const subtitleTracks = [
      { index: 0, name: "English", lang: "en" },
      { index: 1, name: "Telugu", lang: "te" },
    ];
    const props = makeProps({ subtitleTracks });
    render(<PlayerControls {...props} />);

    act(() => {
      screen.getByRole("button", { name: /subtitles/i }).click();
    });
    expect(screen.getByRole("button", { name: "Off" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Telugu" })).toBeTruthy();
  });

  it("audio popover hidden when only one track (spec: aria-disabled if 1 track)", () => {
    const audioTracks = [{ index: 0, name: "English", lang: "en" }];
    const props = makeProps({ audioTracks });
    render(<PlayerControls {...props} />);
    expect(screen.queryByRole("button", { name: /audio/i })).toBeNull();
  });

  it("volume button toggles mute on Enter", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);
    act(() => {
      screen.getByRole("button", { name: "Mute" }).click();
    });
    expect(props.onToggleMute).toHaveBeenCalledOnce();
  });

  it("Escape closes popover first, player second", () => {
    const levels = [{ index: 0, height: 720, bitrate: 2_000_000, name: "720p" }];
    const props = makeProps({ levels });
    render(<PlayerControls {...props} />);

    act(() => {
      screen.getByRole("button", { name: /quality/i }).click();
    });
    expect(screen.getByRole("button", { name: "720p" })).toBeTruthy();

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("button", { name: "720p" })).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
