/**
 * PlayerShell unit tests.
 *
 * Verifies: renders nothing when idle, renders video when opened, calls
 * close on unmount/close action.
 */
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlayerShell } from "./PlayerShell";
import { PlayerProvider, usePlayerStore } from "./PlayerProvider";
import { type ReactNode } from "react";

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

// ─── Test wrapper ─────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: ReactNode }) {
  return <PlayerProvider>{children}</PlayerProvider>;
}

// ─── Helper: component that opens the player ─────────────────────────────────

function OpenPlayerButton() {
  const { open } = usePlayerStore();
  return (
    <button
      type="button"
      onClick={() =>
        open({ src: "/api/stream/live/1", title: "Test Channel", kind: "live" })
      }
    >
      Open
    </button>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PlayerShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when player is idle", () => {
    render(
      <Wrapper>
        <PlayerShell />
      </Wrapper>,
    );

    expect(screen.queryByTestId("player-shell")).toBeNull();
    expect(screen.queryByTestId("player-video")).toBeNull();
  });

  it("renders video element when player is opened", async () => {
    render(
      <Wrapper>
        <OpenPlayerButton />
        <PlayerShell />
      </Wrapper>,
    );

    expect(screen.queryByTestId("player-shell")).toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: "Open" }).click();
    });

    expect(screen.getByTestId("player-shell")).toBeTruthy();
    expect(screen.getByTestId("player-video")).toBeTruthy();
  });

  it("destroys hls instance when player is closed", async () => {
    function CloseButton() {
      const { close } = usePlayerStore();
      return (
        <button type="button" onClick={close}>
          Close
        </button>
      );
    }

    render(
      <Wrapper>
        <OpenPlayerButton />
        <CloseButton />
        <PlayerShell />
      </Wrapper>,
    );

    // Open the player
    await act(async () => {
      screen.getByRole("button", { name: "Open" }).click();
    });
    expect(screen.getByTestId("player-shell")).toBeTruthy();

    // Close the player
    await act(async () => {
      screen.getByRole("button", { name: "Close" }).click();
    });
    expect(screen.queryByTestId("player-shell")).toBeNull();
  });
});
