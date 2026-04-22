/**
 * SplitGuide tests (Task 4.3)
 *
 * Covers:
 *  - render with channels (preview + list regions, names present)
 *  - empty state: role=alert + onRetry callback fires (NOT window.location.reload)
 *  - selected-channel visual state (aria-current + "LIVE" indicator)
 *  - D-pad focus registration: each row calls useFocusable with
 *    focusKey: `CHANNEL_<id>` (lesson from Task 2.4 — unregistered
 *    rows are unreachable on Fire TV remotes)
 *  - accessibility: channel list has role=list + aria-label
 *
 * Mocking norigin: jsdom can't drive the native focus manager, so we
 * spy-mock useFocusable the same way BottomDock.test.tsx does. The spy
 * lets us assert focusKey registration without needing a real focus graph.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { Channel } from "../../api/schemas";

const useFocusableSpy = vi.hoisted(() => vi.fn());
vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  init: vi.fn(),
  useFocusable: (opts?: {
    focusKey?: string;
    onEnterPress?: () => void;
  }) => {
    useFocusableSpy(opts);
    return {
      ref: { current: null },
      focusKey: opts?.focusKey ?? "MOCK_KEY",
      focused: false,
      focusSelf: vi.fn(),
    };
  },
  FocusContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  setFocus: vi.fn(),
}));

import { SplitGuide } from "./SplitGuide";

const mockChannels: Channel[] = [
  {
    id: "1",
    num: 101,
    name: "BBC News",
    categoryId: "news",
    streamUrl: "https://example.com/bbc.m3u8",
  },
  {
    id: "2",
    num: 202,
    name: "CNN",
    categoryId: "news",
    streamUrl: "https://example.com/cnn.m3u8",
  },
];

describe("SplitGuide", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
  });

  it("renders preview region and channel list with channel names", () => {
    render(
      <SplitGuide
        channels={mockChannels}
        selectedChannelId="1"
        onSelectChannel={() => {}}
      />,
    );
    expect(
      screen.getByRole("region", { name: /preview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /channel list/i }),
    ).toBeInTheDocument();
    // "BBC News" appears in both the preview pane (selected) and the list row
    expect(screen.getAllByText("BBC News").length).toBeGreaterThan(0);
    expect(screen.getByText("CNN")).toBeInTheDocument();
  });

  it("selected channel has aria-current=true and shows LIVE indicator", () => {
    render(
      <SplitGuide
        channels={mockChannels}
        selectedChannelId="2"
        onSelectChannel={() => {}}
      />,
    );
    const cnnButton = screen.getByRole("button", { name: /channel 202: cnn/i });
    expect(cnnButton).toHaveAttribute("aria-current", "true");
    expect(cnnButton.textContent).toMatch(/LIVE/);

    const bbcButton = screen.getByRole("button", {
      name: /channel 101: bbc news/i,
    });
    expect(bbcButton).not.toHaveAttribute("aria-current", "true");
  });

  it("fires onSelectChannel when a row is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <SplitGuide
        channels={mockChannels}
        selectedChannelId="1"
        onSelectChannel={onSelect}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /channel 202: cnn/i }),
    );
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("registers each channel row with norigin via focusKey CHANNEL_<id>", () => {
    render(
      <SplitGuide
        channels={mockChannels}
        selectedChannelId="1"
        onSelectChannel={() => {}}
      />,
    );
    const focusKeys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);
    expect(focusKeys).toContain("CHANNEL_1");
    expect(focusKeys).toContain("CHANNEL_2");
  });

  it("renders EPG Now/Next when provided", () => {
    render(
      <SplitGuide
        channels={mockChannels}
        selectedChannelId="1"
        onSelectChannel={() => {}}
        epgCurrentTitle="Morning News"
        epgNextTitle="World Today"
      />,
    );
    expect(screen.getByText(/Morning News/)).toBeInTheDocument();
    expect(screen.getByText(/World Today/)).toBeInTheDocument();
  });

  it("empty channels shows role=alert and fires onRetry callback (NOT reload)", async () => {
    const onRetry = vi.fn();
    const reloadSpy = vi.fn();
    // Guard: if implementation leaks window.location.reload, this would throw
    // in jsdom. We also assert it was never called.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    render(
      <SplitGuide
        channels={[]}
        selectedChannelId={null}
        onSelectChannel={() => {}}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("shows Skeleton loading state when loading prop is true", () => {
    const { container } = render(
      <SplitGuide
        channels={[]}
        selectedChannelId={null}
        onSelectChannel={() => {}}
        loading
      />,
    );
    // Skeleton renders aria-hidden divs with .skeleton class
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    // Must NOT show ErrorShell during loading even if channels is []
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it('falls back to "No channel selected" when selectedChannelId is null', () => {
    render(
      <SplitGuide
        channels={mockChannels}
        selectedChannelId={null}
        onSelectChannel={() => {}}
      />,
    );
    expect(screen.getByText(/No channel selected/i)).toBeInTheDocument();
  });
});
