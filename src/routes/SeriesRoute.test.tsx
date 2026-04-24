/**
 * SeriesRoute tests — Phase 4a rebuild.
 *
 * The rebuilt route has no CategoryStrip. Items come from
 * streamSeriesLanguageUnion (cached categories + bounded-parallel per-category
 * fetches + dedupe). Tests mock the union module directly.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { SeriesItem } from "../api/schemas";

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

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const streamSeriesLanguageUnionMock = vi.hoisted(() => vi.fn());
const invalidateSeriesLanguageUnionCacheMock = vi.hoisted(() => vi.fn());
vi.mock("../features/series/seriesLanguageUnion", () => ({
  streamSeriesLanguageUnion: streamSeriesLanguageUnionMock,
  invalidateSeriesLanguageUnionCache: invalidateSeriesLanguageUnionCacheMock,
  lookupCachedSeries: vi.fn(() => undefined),
}));

const fetchHistoryMock = vi.hoisted(() => vi.fn());
vi.mock("../api/history", () => ({
  fetchHistory: fetchHistoryMock,
  recordHistory: vi.fn(),
  removeHistoryItem: vi.fn(),
}));

vi.mock("../api/favorites", () => ({
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  isFavorited: () => false,
}));

vi.mock("../api/series", () => ({
  fetchSeriesInfo: vi.fn(),
  fetchSeriesCategories: vi.fn(),
  fetchSeriesList: vi.fn(),
}));

const openPlayerMock = vi.hoisted(() => vi.fn());
vi.mock("../player/usePlayerOpener", () => ({
  usePlayerOpener: () => ({ openPlayer: openPlayerMock }),
}));
vi.mock("../player/PlayerProvider", () => ({
  usePlayerStore: () => ({ state: { status: "idle" } }),
}));

// Force "all" language so mock items pass the filter.
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

import { SeriesRoute } from "./SeriesRoute";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const mockItems: SeriesItem[] = [
  {
    id: "s1",
    name: "Breaking Bad",
    categoryId: "cat1",
    icon: null,
    isAdult: false,
    rating: "9.5",
    year: "2008",
    added: "2024-01-01T00:00:00Z",
  },
  {
    id: "s2",
    name: "The Wire",
    categoryId: "cat1",
    icon: "https://example.com/wire.jpg",
    isAdult: false,
    added: "2026-04-20T00:00:00Z",
  },
];

function emitBatch(items: SeriesItem[]) {
  return (
    _lang: string,
    onBatch: (b: {
      items: SeriesItem[];
      isFinal: boolean;
      matchedCategories: number;
      completedCategories: number;
    }) => void,
  ) => {
    onBatch({
      items,
      isFinal: true,
      matchedCategories: 1,
      completedCategories: 1,
    });
    return Promise.resolve();
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("SeriesRoute", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
    mockNavigate.mockClear();
    openPlayerMock.mockClear();
    streamSeriesLanguageUnionMock.mockReset();
    invalidateSeriesLanguageUnionCacheMock.mockReset();
    fetchHistoryMock.mockReset();
    fetchHistoryMock.mockResolvedValue([]);
    langRef.current = "all";
    localStorage.clear();
  });

  it("shows skeleton while the language union is pending", () => {
    streamSeriesLanguageUnionMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SeriesRoute />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders ErrorShell when the union fetch rejects", async () => {
    streamSeriesLanguageUnionMock.mockRejectedValue(new Error("network down"));
    render(<SeriesRoute />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/can't load series/i)).toBeInTheDocument();
  });

  it("Retry re-runs the union fetch — does not call window.location.reload", async () => {
    streamSeriesLanguageUnionMock.mockRejectedValueOnce(new Error("oops"));
    render(<SeriesRoute />);
    await screen.findByRole("alert");

    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    streamSeriesLanguageUnionMock.mockImplementationOnce(emitBatch(mockItems));
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(invalidateSeriesLanguageUnionCacheMock).toHaveBeenCalled();
    expect(streamSeriesLanguageUnionMock).toHaveBeenCalledTimes(2);
  });

  it("renders series cards once the union resolves", async () => {
    streamSeriesLanguageUnionMock.mockImplementation(emitBatch(mockItems));
    render(<SeriesRoute />);
    expect(
      await screen.findByRole("button", { name: /breaking bad/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /the wire/i })).toBeInTheDocument();
  });

  it("clicking a series card navigates to /series/:id (never openPlayer)", async () => {
    streamSeriesLanguageUnionMock.mockImplementation(emitBatch(mockItems));
    render(<SeriesRoute />);
    const card = await screen.findByRole("button", { name: /breaking bad/i });
    await userEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith("/series/s1");
    expect(openPlayerMock).not.toHaveBeenCalled();
  });

  it("renders the language-switch empty state when the union is empty", async () => {
    langRef.current = "telugu";
    streamSeriesLanguageUnionMock.mockImplementation(emitBatch([]));
    render(<SeriesRoute />);
    expect(
      await screen.findByText(/no telugu series in this catalog/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try hindi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show all/i })).toBeInTheDocument();
  });

  it("renders the sort toolbar with Newest default + series count", async () => {
    streamSeriesLanguageUnionMock.mockImplementation(emitBatch(mockItems));
    render(<SeriesRoute />);
    await screen.findByRole("button", { name: /breaking bad/i });
    const newestBtn = screen.getByRole("button", { name: /^newest$/i });
    expect(newestBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/2 series/i)).toBeInTheDocument();
  });

  it("flipping sort to Name reorders cards alphabetically", async () => {
    streamSeriesLanguageUnionMock.mockImplementation(emitBatch(mockItems));
    render(<SeriesRoute />);
    await screen.findByRole("button", { name: /breaking bad/i });
    await userEvent.click(screen.getByRole("button", { name: /^name$/i }));
    const cards = screen
      .getAllByRole("button")
      .filter((b) => /breaking bad|the wire/i.test(b.getAttribute("aria-label") ?? ""));
    expect(cards[0]?.getAttribute("aria-label")).toMatch(/breaking bad/i);
  });

  it("registers CONTENT_AREA_SERIES + per-card SERIES_CARD_* focus keys", async () => {
    streamSeriesLanguageUnionMock.mockImplementation(emitBatch(mockItems));
    render(<SeriesRoute />);
    await screen.findByRole("button", { name: /breaking bad/i });
    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);
    expect(keys).toContain("CONTENT_AREA_SERIES");
    expect(keys).toContain("SERIES_CARD_s1");
    expect(keys).toContain("SERIES_CARD_s2");
  });

  it("renders a Resume hero when history has a partially-watched series episode", async () => {
    streamSeriesLanguageUnionMock.mockImplementation(emitBatch(mockItems));
    fetchHistoryMock.mockResolvedValue([
      {
        id: 1,
        content_type: "series",
        content_id: 42,
        content_name: "Panchayat · S2E4 · Title",
        content_icon: null,
        progress_seconds: 600,
        duration_seconds: 1800,
        watched_at: "2026-04-23T10:00:00Z",
      },
    ]);
    render(<SeriesRoute />);
    expect(
      await screen.findByRole("button", { name: /resume s2e4 of panchayat/i }),
    ).toBeInTheDocument();
  });
});
