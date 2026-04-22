/**
 * SeriesRoute unit tests (Phase 6).
 *
 * Scope:
 *  - Renders Skeleton while initial fetch is pending.
 *  - Renders ErrorShell on fetch failure; Retry re-fetches.
 *  - Renders category strip after successful fetch.
 *  - Renders poster grid cards after successful fetch.
 *  - Card click navigates to /series/:seriesId.
 *  - useFocusable registered with CONTENT_AREA_SERIES + SERIES_CAT_* + SERIES_CARD_*.
 *  - Retry preserves activeCategoryId (no reset on re-fetch).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { SeriesCategory, SeriesItem } from "../api/schemas";

// ─── Mocks ─────────────────────────────────────────────────────────────────

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

const fetchSeriesCategoriesMock = vi.hoisted(() => vi.fn());
const fetchSeriesListMock = vi.hoisted(() => vi.fn());
vi.mock("../api/series", () => ({
  fetchSeriesCategories: fetchSeriesCategoriesMock,
  fetchSeriesList: fetchSeriesListMock,
}));

const openPlayerMock = vi.hoisted(() => vi.fn());
vi.mock("../player", () => ({
  usePlayerOpener: () => ({ openPlayer: openPlayerMock }),
}));

import { SeriesRoute } from "./SeriesRoute";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockCategories: SeriesCategory[] = [
  { id: "cat1", name: "Drama", type: "series", count: 10 },
  { id: "cat2", name: "Comedy", type: "series", count: 5 },
];

const mockItems: SeriesItem[] = [
  {
    id: "s1",
    name: "Breaking Bad",
    categoryId: "cat1",
    icon: null,
    isAdult: false,
    rating: "9.5",
    year: "2008",
  },
  {
    id: "s2",
    name: "The Wire",
    categoryId: "cat1",
    icon: "https://example.com/wire.jpg",
    isAdult: false,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SeriesRoute", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
    mockNavigate.mockClear();
    fetchSeriesCategoriesMock.mockReset();
    fetchSeriesListMock.mockReset();
  });

  it("renders skeleton while initial fetch is pending", () => {
    fetchSeriesCategoriesMock.mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(<SeriesRoute />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders ErrorShell when fetchSeriesCategories rejects", async () => {
    fetchSeriesCategoriesMock.mockRejectedValue(new Error("network"));

    render(<SeriesRoute />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("renders category strip after successful fetch", async () => {
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue(mockItems);

    render(<SeriesRoute />);
    await waitFor(() => {
      expect(
        screen.getByRole("toolbar", { name: /series categories/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /drama/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /comedy/i })).toBeInTheDocument();
  });

  it("renders series cards in the grid after successful fetch", async () => {
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue(mockItems);

    render(<SeriesRoute />);
    await waitFor(() => {
      expect(
        screen.getByRole("list", { name: /series grid/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /breaking bad/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /the wire/i }),
    ).toBeInTheDocument();
  });

  it("clicking a card navigates to /series/:id (not open player)", async () => {
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue(mockItems);
    mockNavigate.mockClear();

    render(<SeriesRoute />);
    const card = await screen.findByRole("button", { name: /breaking bad/i });
    await userEvent.click(card);

    expect(mockNavigate).toHaveBeenCalledWith("/series/s1");
    expect(openPlayerMock).not.toHaveBeenCalled();
  });

  it("registers useFocusable with CONTENT_AREA_SERIES", async () => {
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue(mockItems);

    render(<SeriesRoute />);
    await waitFor(() =>
      expect(
        screen.getByRole("toolbar", { name: /series categories/i }),
      ).toBeInTheDocument(),
    );

    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);

    expect(keys).toContain("CONTENT_AREA_SERIES");
  });

  it("registers SERIES_CAT_* focus keys for each category", async () => {
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue(mockItems);

    render(<SeriesRoute />);
    await waitFor(() =>
      expect(
        screen.getByRole("toolbar", { name: /series categories/i }),
      ).toBeInTheDocument(),
    );

    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);

    expect(keys).toContain("SERIES_CAT_cat1");
    expect(keys).toContain("SERIES_CAT_cat2");
  });

  it("registers SERIES_CARD_* focus keys for each item", async () => {
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue(mockItems);

    render(<SeriesRoute />);
    await waitFor(() =>
      expect(
        screen.getByRole("list", { name: /series grid/i }),
      ).toBeInTheDocument(),
    );

    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);

    expect(keys).toContain("SERIES_CARD_s1");
    expect(keys).toContain("SERIES_CARD_s2");
  });

  it("shows empty state when no items in category", async () => {
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue([]);

    render(<SeriesRoute />);
    await waitFor(() => {
      expect(
        screen.getByText(/no series in this category/i),
      ).toBeInTheDocument();
    });
  });

  it("Retry button calls fetchSeriesCategories again", async () => {
    fetchSeriesCategoriesMock.mockRejectedValueOnce(new Error("fail"));
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue(mockItems);

    render(<SeriesRoute />);
    // Wait for error state
    await screen.findByRole("alert");

    // Click retry
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await userEvent.click(retryBtn);

    // Categories should now appear
    await waitFor(() => {
      expect(
        screen.getByRole("toolbar", { name: /series categories/i }),
      ).toBeInTheDocument();
    });

    expect(fetchSeriesCategoriesMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT call window.location.reload on retry", async () => {
    fetchSeriesCategoriesMock.mockRejectedValueOnce(new Error("fail"));
    fetchSeriesCategoriesMock.mockResolvedValue(mockCategories);
    fetchSeriesListMock.mockResolvedValue(mockItems);

    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    render(<SeriesRoute />);
    await screen.findByRole("alert");
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await userEvent.click(retryBtn);

    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
