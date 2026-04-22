/**
 * useFavorites — unit tests (Phase 8)
 *
 * Covers:
 *  - Initial load fetches favorites from API
 *  - Optimistic toggle add + rollback on failure
 *  - Optimistic toggle remove + rollback on failure
 *  - isFav reflects in-memory state
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FavoriteItem } from "../../api/schemas";

// ─── Mock API ─────────────────────────────────────────────────────────────────

const fetchFavoritesMock = vi.hoisted(() => vi.fn());
const addFavoriteMock = vi.hoisted(() => vi.fn());
const removeFavoriteMock = vi.hoisted(() => vi.fn());
const isFavoritedMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/favorites", () => ({
  fetchFavorites: fetchFavoritesMock,
  addFavorite: addFavoriteMock,
  removeFavorite: removeFavoriteMock,
  isFavorited: isFavoritedMock,
}));

import { useFavorites } from "./useFavorites";

const mockFav: FavoriteItem = {
  id: 1,
  content_type: "vod",
  content_id: 42,
  content_name: "Test Movie",
  content_icon: null,
  category_name: "Action",
  sort_order: 1,
  added_at: "2026-01-01T00:00:00Z",
};

describe("useFavorites", () => {
  beforeEach(() => {
    fetchFavoritesMock.mockResolvedValue([mockFav]);
    addFavoriteMock.mockResolvedValue(undefined);
    removeFavoriteMock.mockResolvedValue(undefined);
    isFavoritedMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads favorites on mount", async () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.favorites[0]?.content_name).toBe("Test Movie");
  });

  it("isFav returns true for loaded items", async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFav(42, "vod")).toBe(true);
  });

  it("toggle add optimistically adds then confirms", async () => {
    fetchFavoritesMock.mockResolvedValue([]);
    isFavoritedMock.mockReturnValue(false);
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.favorites).toHaveLength(0);

    await act(async () => {
      await result.current.toggle(99, "vod", { content_name: "New Movie" });
    });

    expect(result.current.favorites.some((f) => f.content_id === 99)).toBe(true);
    expect(addFavoriteMock).toHaveBeenCalledWith(99, {
      content_type: "vod",
      content_name: "New Movie",
    });
  });

  it("toggle add rolls back on API failure", async () => {
    fetchFavoritesMock.mockResolvedValue([]);
    isFavoritedMock.mockReturnValue(false);
    addFavoriteMock.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle(99, "vod", { content_name: "New Movie" });
    });

    // After rollback, the optimistic item should be gone.
    expect(result.current.favorites.some((f) => f.content_id === 99)).toBe(
      false,
    );
  });

  it("toggle remove optimistically removes then confirms", async () => {
    isFavoritedMock.mockReturnValue(false); // rely on in-memory state
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.favorites).toHaveLength(1);

    await act(async () => {
      await result.current.toggle(42, "vod", {});
    });

    expect(result.current.favorites.some((f) => f.content_id === 42)).toBe(
      false,
    );
    expect(removeFavoriteMock).toHaveBeenCalledWith(42, "vod");
  });

  it("toggle remove rolls back on API failure", async () => {
    isFavoritedMock.mockReturnValue(false);
    removeFavoriteMock.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.favorites).toHaveLength(1);

    await act(async () => {
      await result.current.toggle(42, "vod", {});
    });

    // Rollback: item should be back.
    expect(result.current.favorites.some((f) => f.content_id === 42)).toBe(
      true,
    );
  });

  it("reload re-fetches favorites", async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchFavoritesMock.mockResolvedValue([]);
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.favorites).toHaveLength(0);
  });
});
