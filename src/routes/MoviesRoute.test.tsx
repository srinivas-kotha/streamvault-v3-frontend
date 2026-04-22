/**
 * MoviesRoute tests (Phase 5b)
 *
 * Scope:
 *  - Renders Skeleton while initial fetch is pending.
 *  - Renders ErrorShell on fetch failure; Retry calls the re-fetch (NOT reload).
 *  - Renders category chips when categories are returned.
 *  - Renders movie cards (poster buttons) when streams are returned.
 *  - Clicking a card calls navigate(`/movies/:id`).
 *  - CONTENT_AREA_MOVIES focus key is registered.
 *  - VOD_CAT_* and VOD_CARD_* focus keys are registered.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { VodCategory, VodStream } from "../api/schemas";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const useFocusableSpy = vi.hoisted(() => vi.fn());
vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  init: vi.fn(),
  useFocusable: (opts?: { focusKey?: string; onEnterPress?: () => void }) => {
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

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const fetchVodCategoriesMock = vi.hoisted(() => vi.fn());
const fetchVodStreamsMock = vi.hoisted(() => vi.fn());
vi.mock("../api/vod", () => ({
  fetchVodCategories: fetchVodCategoriesMock,
  fetchVodStreams: fetchVodStreamsMock,
}));

const openPlayerMock = vi.hoisted(() => vi.fn());
vi.mock("../player", () => ({
  usePlayerOpener: () => ({ openPlayer: openPlayerMock }),
}));

// Mock langPref: return "all" so language filter passes all mock streams
// (mock category names like "Action"/"Comedy" don't match language patterns).
vi.mock("../lib/langPref", () => ({
  getLangPref: () => "all",
  setLangPref: vi.fn(),
}));

import { MoviesRoute } from "./MoviesRoute";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const mockCategories: VodCategory[] = [
  { id: "cat1", name: "Action", parentId: null, type: "vod", count: 42 },
  { id: "cat2", name: "Comedy", parentId: null, type: "vod", count: 18 },
];

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
  },
  {
    id: "v2",
    name: "Aliens",
    type: "vod",
    categoryId: "cat1",
    icon: "https://example.com/aliens.jpg",
    isAdult: false,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("MoviesRoute", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
    mockNavigate.mockClear();
    fetchVodCategoriesMock.mockReset();
    fetchVodStreamsMock.mockReset();
  });

  it("renders skeleton while initial fetch is pending", () => {
    fetchVodCategoriesMock.mockReturnValue(new Promise(() => {})); // never resolves
    fetchVodStreamsMock.mockReturnValue(new Promise(() => {}));

    const { container } = render(<MoviesRoute />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders ErrorShell when fetchVodCategories rejects", async () => {
    fetchVodCategoriesMock.mockRejectedValue(new Error("network down"));
    fetchVodStreamsMock.mockResolvedValue([]);

    render(<MoviesRoute />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/can't load movies/i)).toBeInTheDocument();
  });

  it("Retry button re-fetches (does NOT call window.location.reload)", async () => {
    // First render errors
    fetchVodCategoriesMock.mockRejectedValueOnce(new Error("oops"));

    render(<MoviesRoute />);
    await screen.findByRole("alert");

    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    // Now retry succeeds
    fetchVodCategoriesMock.mockResolvedValueOnce(mockCategories);
    fetchVodStreamsMock.mockResolvedValueOnce(mockStreams);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(fetchVodCategoriesMock).toHaveBeenCalledTimes(2);
  });

  it("renders category chips after successful fetch", async () => {
    fetchVodCategoriesMock.mockResolvedValue(mockCategories);
    fetchVodStreamsMock.mockResolvedValue(mockStreams);

    render(<MoviesRoute />);
    await waitFor(() => {
      expect(
        screen.getByRole("tablist", { name: /movie categories/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: /action/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /comedy/i })).toBeInTheDocument();
  });

  it("renders movie cards (poster buttons) after successful fetch", async () => {
    fetchVodCategoriesMock.mockResolvedValue(mockCategories);
    fetchVodStreamsMock.mockResolvedValue(mockStreams);

    render(<MoviesRoute />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /die hard/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /aliens/i })).toBeInTheDocument();
  });

  it("renders empty state when streams array is empty", async () => {
    fetchVodCategoriesMock.mockResolvedValue(mockCategories);
    fetchVodStreamsMock.mockResolvedValue([]);

    render(<MoviesRoute />);
    await waitFor(() => {
      expect(
        screen.getByText(/no movies in this category/i),
      ).toBeInTheDocument();
    });
  });

  it("clicking a movie card opens the player with the vod kind + item title", async () => {
    fetchVodCategoriesMock.mockResolvedValue(mockCategories);
    fetchVodStreamsMock.mockResolvedValue(mockStreams);
    openPlayerMock.mockClear();

    render(<MoviesRoute />);
    const card = await screen.findByRole("button", { name: /die hard/i });
    await userEvent.click(card);

    expect(openPlayerMock).toHaveBeenCalledWith({
      kind: "vod",
      id: "v1",
      title: "Die Hard",
    });
  });

  it("registers CONTENT_AREA_MOVIES focus key", async () => {
    fetchVodCategoriesMock.mockResolvedValue(mockCategories);
    fetchVodStreamsMock.mockResolvedValue(mockStreams);

    render(<MoviesRoute />);
    await waitFor(() =>
      expect(screen.getByRole("tablist", { name: /movie categories/i })).toBeInTheDocument(),
    );

    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);
    expect(keys).toContain("CONTENT_AREA_MOVIES");
  });

  it("registers VOD_CAT_* and VOD_CARD_* focus keys", async () => {
    fetchVodCategoriesMock.mockResolvedValue(mockCategories);
    fetchVodStreamsMock.mockResolvedValue(mockStreams);

    render(<MoviesRoute />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /die hard/i })).toBeInTheDocument(),
    );

    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);
    expect(keys).toContain("VOD_CAT_cat1");
    expect(keys).toContain("VOD_CAT_cat2");
    expect(keys).toContain("VOD_CARD_v1");
    expect(keys).toContain("VOD_CARD_v2");
  });

  it("clicking a category chip triggers fetchVodStreams for that category", async () => {
    fetchVodCategoriesMock.mockResolvedValue(mockCategories);
    fetchVodStreamsMock.mockResolvedValue(mockStreams);

    render(<MoviesRoute />);
    await screen.findByRole("tab", { name: /comedy/i });

    // Mock different streams for Comedy
    fetchVodStreamsMock.mockResolvedValueOnce([
      {
        id: "v3",
        name: "Superbad",
        type: "vod" as const,
        categoryId: "cat2",
        icon: null,
        isAdult: false,
      },
    ]);

    await act(async () => {
      await userEvent.click(screen.getByRole("tab", { name: /comedy/i }));
    });

    await waitFor(() => {
      expect(fetchVodStreamsMock).toHaveBeenCalledWith("cat2");
    });
  });
});
