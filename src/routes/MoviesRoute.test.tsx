/**
 * MoviesRoute tests — Phase 2 rebuild.
 *
 * The rebuilt route has no CategoryStrip. Streams come from fetchLanguageUnion
 * (cached categories + bounded-parallel per-category fetches + dedupe) and
 * are rendered through VirtuosoGrid. Tests mock the language-union module
 * directly rather than re-running its internal orchestration.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { VodStream } from "../api/schemas";

// ─── Mocks ──────────────────────────────────────────────────────────────────

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

const streamLanguageUnionMock = vi.hoisted(() => vi.fn());
const invalidateLanguageUnionCacheMock = vi.hoisted(() => vi.fn());
const lookupCachedStreamMock = vi.hoisted(() => vi.fn(() => undefined));
vi.mock("../features/movies/languageUnion", () => ({
  streamLanguageUnion: streamLanguageUnionMock,
  invalidateLanguageUnionCache: invalidateLanguageUnionCacheMock,
  lookupCachedStream: lookupCachedStreamMock,
}));

const fetchHistoryMock = vi.hoisted(() => vi.fn());
vi.mock("../api/history", () => ({
  fetchHistory: fetchHistoryMock,
  recordHistory: vi.fn(),
}));

vi.mock("../api/favorites", () => ({
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  isFavorited: () => false,
}));

vi.mock("../api/vod", () => ({
  fetchVodInfo: vi.fn(() => new Promise(() => {})),
}));

const openPlayerMock = vi.hoisted(() => vi.fn());
vi.mock("../player/usePlayerOpener", () => ({
  usePlayerOpener: () => ({ openPlayer: openPlayerMock }),
}));

// Use "all" for tests so all mock streams pass the language filter, and
// force the hook's setLang to actually flip internal state so we can assert
// on chip clicks.
const langRef = { current: "all" as "all" | "telugu" | "hindi" | "english" };
vi.mock("../lib/useLangPref", () => ({
  useLangPref: () => {
    const [value, setValue] = React.useState(langRef.current);
    const set = (next: typeof langRef.current) => {
      langRef.current = next;
      setValue(next);
    };
    return [value, set] as const;
  },
}));

// react-virtuoso: jsdom has no real layout engine. Render all items eagerly.
vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    totalCount,
    itemContent,
  }: {
    totalCount: number;
    itemContent: (index: number) => React.ReactNode;
  }) => (
    <div>
      {Array.from({ length: totalCount }, (_, i) => (
        <div key={i}>{itemContent(i)}</div>
      ))}
    </div>
  ),
}));

import { MoviesRoute } from "./MoviesRoute";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const mockStreams: VodStream[] = [
  {
    id: "v1",
    name: "Die Hard",
    type: "vod",
    categoryId: "cat1",
    icon: null,
    isAdult: false,
    year: "1988",
    rating: "8.2",
    added: "2024-01-01T00:00:00Z",
  },
  {
    id: "v2",
    name: "Aliens",
    type: "vod",
    categoryId: "cat1",
    icon: "https://example.com/aliens.jpg",
    isAdult: false,
    added: "2026-04-01T00:00:00Z",
  },
];

describe("MoviesRoute", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
    openPlayerMock.mockClear();
    streamLanguageUnionMock.mockReset();
    invalidateLanguageUnionCacheMock.mockReset();
    lookupCachedStreamMock.mockReset();
    lookupCachedStreamMock.mockReturnValue(undefined);
    fetchHistoryMock.mockReset();
    fetchHistoryMock.mockResolvedValue([]);
    langRef.current = "all";
    localStorage.clear();
  });

  it("shows skeleton while the language union is pending", () => {
    streamLanguageUnionMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<MoviesRoute />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders ErrorShell when the union fetch rejects", async () => {
    streamLanguageUnionMock.mockRejectedValue(new Error("network down"));
    render(<MoviesRoute />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/can't load movies/i)).toBeInTheDocument();
  });

  it("Retry re-runs the union fetch — does not call window.location.reload", async () => {
    streamLanguageUnionMock.mockRejectedValueOnce(new Error("oops"));
    render(<MoviesRoute />);
    await screen.findByRole("alert");

    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    streamLanguageUnionMock.mockImplementationOnce(
      (_lang: string, onBatch: (b: unknown) => void) => {
        onBatch({
          streams: mockStreams,
          isFinal: true,
          matchedCategories: 1,
          completedCategories: 1,
        });
        return Promise.resolve();
      },
    );
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(invalidateLanguageUnionCacheMock).toHaveBeenCalled();
    expect(streamLanguageUnionMock).toHaveBeenCalledTimes(2);
  });

  it("renders movie cards once the union resolves", async () => {
    streamLanguageUnionMock.mockImplementation(
      (_lang: string, onBatch: (b: unknown) => void) => {
        onBatch({
          streams: mockStreams,
          isFinal: true,
          matchedCategories: 2,
          completedCategories: 2,
        });
        return Promise.resolve();
      },
    );
    render(<MoviesRoute />);
    expect(
      await screen.findByRole("button", { name: /die hard/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /aliens/i })).toBeInTheDocument();
  });

  it("clicking a movie card opens the player with the vod kind + item title", async () => {
    streamLanguageUnionMock.mockImplementation(
      (_lang: string, onBatch: (b: unknown) => void) => {
        onBatch({
          streams: mockStreams,
          isFinal: true,
          matchedCategories: 1,
          completedCategories: 1,
        });
        return Promise.resolve();
      },
    );
    render(<MoviesRoute />);
    const card = await screen.findByRole("button", { name: /die hard/i });
    await userEvent.click(card);
    expect(openPlayerMock).toHaveBeenCalledWith({
      kind: "vod",
      id: "v1",
      title: "Die Hard",
    });
  });

  it("renders the language-switch empty state when the union is empty", async () => {
    langRef.current = "telugu";
    streamLanguageUnionMock.mockImplementation(
      (_lang: string, onBatch: (b: unknown) => void) => {
        onBatch({
          streams: [],
          isFinal: true,
          matchedCategories: 0,
          completedCategories: 0,
        });
        return Promise.resolve();
      },
    );
    render(<MoviesRoute />);
    expect(
      await screen.findByText(/no telugu movies in this catalog/i),
    ).toBeInTheDocument();
    // EmptyStateWithLanguageSwitch renders "Try Hindi" / "Try English" /
    // "Show All" buttons (current lang is Telugu → Telugu button omitted).
    expect(screen.getByRole("button", { name: /try hindi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show all/i })).toBeInTheDocument();
  });

  it("renders the sort toolbar with Newest default + movie count", async () => {
    streamLanguageUnionMock.mockImplementation(
      (_lang: string, onBatch: (b: unknown) => void) => {
        onBatch({
          streams: mockStreams,
          isFinal: true,
          matchedCategories: 1,
          completedCategories: 1,
        });
        return Promise.resolve();
      },
    );
    render(<MoviesRoute />);
    await screen.findByRole("button", { name: /die hard/i });
    const newestBtn = screen.getByRole("button", { name: /^newest$/i });
    expect(newestBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/2 movies/i)).toBeInTheDocument();
  });

  it("exposes Year as a sort option", async () => {
    streamLanguageUnionMock.mockImplementation(
      (_lang: string, onBatch: (b: unknown) => void) => {
        onBatch({
          streams: mockStreams,
          isFinal: true,
          matchedCategories: 1,
          completedCategories: 1,
        });
        return Promise.resolve();
      },
    );
    render(<MoviesRoute />);
    await screen.findByRole("button", { name: /die hard/i });
    expect(screen.getByRole("button", { name: /^year$/i })).toBeInTheDocument();
  });

  it("flipping sort to Name reorders the cards alphabetically", async () => {
    streamLanguageUnionMock.mockImplementation(
      (_lang: string, onBatch: (b: unknown) => void) => {
        onBatch({
          streams: mockStreams,
          isFinal: true,
          matchedCategories: 1,
          completedCategories: 1,
        });
        return Promise.resolve();
      },
    );
    render(<MoviesRoute />);
    await screen.findByRole("button", { name: /die hard/i });
    await userEvent.click(screen.getByRole("button", { name: /^name$/i }));
    // "Aliens" should now render before "Die Hard" in DOM order.
    const cards = screen
      .getAllByRole("button")
      .filter((b) => /die hard|aliens/i.test(b.getAttribute("aria-label") ?? ""));
    expect(cards[0]?.getAttribute("aria-label")).toMatch(/aliens/i);
  });

  it("registers CONTENT_AREA_MOVIES focus key + per-card VOD_CARD_* keys", async () => {
    streamLanguageUnionMock.mockImplementation(
      (_lang: string, onBatch: (b: unknown) => void) => {
        onBatch({
          streams: mockStreams,
          isFinal: true,
          matchedCategories: 1,
          completedCategories: 1,
        });
        return Promise.resolve();
      },
    );
    render(<MoviesRoute />);
    await screen.findByRole("button", { name: /die hard/i });
    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);
    expect(keys).toContain("CONTENT_AREA_MOVIES");
    expect(keys).toContain("VOD_CARD_v1");
    expect(keys).toContain("VOD_CARD_v2");
  });
});
