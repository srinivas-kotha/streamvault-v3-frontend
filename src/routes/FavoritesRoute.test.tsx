/**
 * FavoritesRoute tests (Phase 8)
 *
 * Covers:
 *  - Loading state shows skeleton
 *  - Empty state shows empty message
 *  - Populated state shows items grouped by type
 *  - CONTENT_AREA_FAVORITES focusKey registered
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { FavoriteItem } from "../api/schemas";

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

const mockUseFavorites = vi.hoisted(() =>
  vi.fn(() => ({
    favorites: [] as FavoriteItem[],
    loading: false,
    error: null,
    isFav: vi.fn(() => true),
    toggle: vi.fn(),
    reload: vi.fn(),
  })),
);

vi.mock("../features/favorites/useFavorites", () => ({
  useFavorites: mockUseFavorites,
}));

// React Router mock
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

import { FavoritesRoute } from "./FavoritesRoute";

const mockChannel: FavoriteItem = {
  id: 1,
  content_type: "channel",
  content_id: 10,
  content_name: "BBC News",
  content_icon: null,
  category_name: "News",
  sort_order: 1,
  added_at: "2026-01-01T00:00:00Z",
};

const mockMovie: FavoriteItem = {
  id: 2,
  content_type: "vod",
  content_id: 20,
  content_name: "Inception",
  content_icon: null,
  category_name: "Sci-Fi",
  sort_order: 2,
  added_at: "2026-01-02T00:00:00Z",
};

describe("FavoritesRoute", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
    mockUseFavorites.mockReturnValue({
      favorites: [],
      loading: false,
      error: null,
      isFav: vi.fn(() => true),
      toggle: vi.fn(),
      reload: vi.fn(),
    });
  });

  it("shows loading skeleton when loading", () => {
    mockUseFavorites.mockReturnValueOnce({
      favorites: [],
      loading: true,
      error: null,
      isFav: vi.fn(() => false),
      toggle: vi.fn(),
      reload: vi.fn(),
    });

    render(<FavoritesRoute />);
    expect(screen.getByLabelText(/loading favorites/i)).toBeInTheDocument();
  });

  it("shows empty state when no favorites", () => {
    render(<FavoritesRoute />);
    expect(screen.getByLabelText(/no favorites yet/i)).toBeInTheDocument();
  });

  it("renders items grouped by section when populated", async () => {
    mockUseFavorites.mockReturnValueOnce({
      favorites: [mockChannel, mockMovie],
      loading: false,
      error: null,
      isFav: vi.fn(() => true),
      toggle: vi.fn(),
      reload: vi.fn(),
    });

    render(<FavoritesRoute />);

    await waitFor(() => {
      expect(screen.getByText("BBC News")).toBeInTheDocument();
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    expect(screen.getByRole("region", { name: /live channels/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /movies/i })).toBeInTheDocument();
  });

  it("renders page heading", () => {
    render(<FavoritesRoute />);
    expect(
      screen.getByRole("heading", { name: /my favorites/i }),
    ).toBeInTheDocument();
  });

  it("registers CONTENT_AREA_FAVORITES focusKey", () => {
    render(<FavoritesRoute />);
    expect(useFocusableSpy).toHaveBeenCalledWith(
      expect.objectContaining({ focusKey: "CONTENT_AREA_FAVORITES" }),
    );
  });
});
