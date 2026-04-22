/**
 * PlayerControls unit tests.
 *
 * Verifies: play/pause toggle, D-pad seek ±10s, auto-hide timing.
 */
import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { PlayerControls } from "./PlayerControls";
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
}));

// ─── Default props ────────────────────────────────────────────────────────────

function makeProps(overrides = {}) {
  return {
    title: "Test Channel",
    status: "playing" as const,
    currentTime: 30,
    duration: 120,
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

  // Controls start hidden — user must interact to reveal them. Tests need
  // to fire a keydown first to surface the control surface.
  function reveal() {
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
    });
  }

  it("renders play/pause button", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);
    reveal();
    expect(screen.getByRole("button", { name: /pause/i })).toBeTruthy();
  });

  it("calls onPause when pause button is clicked (playing state)", () => {
    const props = makeProps({ status: "playing" });
    render(<PlayerControls {...props} />);
    reveal();

    screen.getByRole("button", { name: /pause/i }).click();
    expect(props.onPause).toHaveBeenCalledOnce();
  });

  it("calls onPlay when play button is clicked (paused state)", () => {
    const props = makeProps({ status: "paused" });
    render(<PlayerControls {...props} />);
    reveal();

    // Use exact match to avoid matching "Close player" button
    screen.getByRole("button", { name: "Play" }).click();
    expect(props.onPlay).toHaveBeenCalledOnce();
  });

  it("seeks -10s on ArrowLeft key", () => {
    const onSeek = vi.fn();
    const props = makeProps({ currentTime: 30, onSeek });
    render(<PlayerControls {...props} />);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenCalledWith(20);
  });

  it("seeks +10s on ArrowRight key", () => {
    const onSeek = vi.fn();
    const props = makeProps({ currentTime: 30, onSeek });
    render(<PlayerControls {...props} />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenCalledWith(40);
  });

  it("auto-hides controls after 3 seconds of idle", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);

    // Controls start HIDDEN on mount — user hasn't touched the remote yet.
    expect(screen.queryByTestId("player-controls")).toBeNull();

    // Reveal via a key press.
    reveal();
    expect(screen.queryByTestId("player-controls")).toBeTruthy();

    // Advance past the 3s auto-hide threshold
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    // Controls should be hidden again
    expect(screen.queryByTestId("player-controls")).toBeNull();
  });

  it("shows controls again on keydown after auto-hide", () => {
    const props = makeProps();
    render(<PlayerControls {...props} />);

    // Hide controls
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByTestId("player-controls")).toBeNull();

    // Any key press should show controls
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(screen.getByTestId("player-controls")).toBeTruthy();
  });

  it("calls onClose when Escape key is pressed with no menu open", () => {
    const onClose = vi.fn();
    const props = makeProps({ onClose });
    render(<PlayerControls {...props} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows quality menu when levels are provided and quality button is clicked", () => {
    const levels = [
      { index: 0, height: 720, bitrate: 2000000, name: "720p" },
      { index: 1, height: 1080, bitrate: 4000000, name: "1080p" },
    ];
    const props = makeProps({ levels });
    render(<PlayerControls {...props} />);
    reveal();

    const qualityBtn = screen.getByRole("button", { name: /quality/i });
    act(() => {
      qualityBtn.click();
    });

    expect(screen.getByRole("button", { name: "720p" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1080p" })).toBeTruthy();
  });

  it("calls onSelectLevel and closes menu when a quality level is selected", () => {
    const onSelectLevel = vi.fn() as Mock;
    const levels = [{ index: 0, height: 720, bitrate: 2000000, name: "720p" }];
    const props = makeProps({ levels, onSelectLevel });
    render(<PlayerControls {...props} />);
    reveal();

    // Open quality menu
    act(() => {
      screen.getByRole("button", { name: /quality/i }).click();
    });

    // Select 720p
    act(() => {
      screen.getByRole("button", { name: "720p" }).click();
    });

    expect(onSelectLevel).toHaveBeenCalledWith(0);
    // Menu should be closed
    expect(screen.queryByRole("button", { name: "720p" })).toBeNull();
  });
});
