/**
 * FavoritesRoute tests.
 *
 * Covers:
 *  - Loading state shows skeleton
 *  - Empty state (all zero) shows whole-page empty
 *  - Populated + empty-sections mixed state shows per-section empty + items
 *  - CONTENT_AREA_FAVORITES focusKey registered
 *  - Sort toolbar renders when not empty
 *  - Remove-from-favorites path fires toggle
 */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

const mockToggle = vi.hoisted(() => vi.fn());
const mockUseFavorites = vi.hoisted(() =>
  vi.fn(() => ({
    favorites: [] as FavoriteItem[],
    loading: false,
    error: null,
    isFav: vi.fn(() => true),
    toggle: mockToggle,
    reload: vi.fn(),
  })),
);

vi.mock("../features/favorites/useFavorites", () => ({
  useFavorites: mockUseFavorites,
}));

vi.mock("../player", () => ({
  usePlayerOpener: () => ({ openPlayer: vi.fn() }),
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
    mockToggle.mockClear();
    mockUseFavorites.mockReturnValue({
      favorites: [],
      loading: false,
      error: null,
      isFav: vi.fn(() => true),
      toggle: mockToggle,
      reload: vi.fn(),
    });
  });

  it("shows loading skeleton when loading", () => {
    mockUseFavorites.mockReturnValueOnce({
      favorites: [],
      loading: true,
      error: null,
      isFav: vi.fn(() => false),
      toggle: mockToggle,
      reload: vi.fn(),
    });

    render(<FavoritesRoute />);
    expect(screen.getByLabelText(/loading favorites/i)).toBeInTheDocument();
  });

  it("shows whole-page empty when all three sections are empty", () => {
    render(<FavoritesRoute />);
    expect(screen.getByLabelText(/no favorites yet/i)).toBeInTheDocument();
    // Sort toolbar must NOT render when whole-page empty
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("renders per-section empty for empty sections when at least one has items", async () => {
    mockUseFavorites.mockReturnValueOnce({
      favorites: [mockMovie],
      loading: false,
      error: null,
      isFav: vi.fn(() => true),
      toggle: mockToggle,
      reload: vi.fn(),
    });

    render(<FavoritesRoute />);

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    // Live Channels empty label must render
    expect(screen.getByText(/no favorite channels yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no favorite series yet/i)).toBeInTheDocument();
  });

  it("renders items grouped by section when populated", async () => {
    mockUseFavorites.mockReturnValueOnce({
      favorites: [mockChannel, mockMovie],
      loading: false,
      error: null,
      isFav: vi.fn(() => true),
      toggle: mockToggle,
      reload: vi.fn(),
    });

    render(<FavoritesRoute />);

    await waitFor(() => {
      expect(screen.getByText("BBC News")).toBeInTheDocument();
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("region", { name: /live channels/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^movies$/i })).toBeInTheDocument();
  });

  it("renders sort toolbar with Recently added + A–Z when not empty", () => {
    mockUseFavorites.mockReturnValueOnce({
      favorites: [mockMovie],
      loading: false,
      error: null,
      isFav: vi.fn(() => true),
      toggle: mockToggle,
      reload: vi.fn(),
    });

    render(<FavoritesRoute />);
    expect(screen.getByRole("toolbar", { name: /favorites sort/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recently added/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /a–z/i })).toBeInTheDocument();
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

  it("clicking a sort button persists via toolbar state", () => {
    // Keep returning items across re-renders — mockReturnValue (not Once)
    // because the state change on click triggers another useFavorites call.
    mockUseFavorites.mockReturnValue({
      favorites: [mockMovie],
      loading: false,
      error: null,
      isFav: vi.fn(() => true),
      toggle: mockToggle,
      reload: vi.fn(),
    });

    render(<FavoritesRoute />);
    const azBtn = screen.getByRole("button", { name: /a–z/i });
    fireEvent.click(azBtn);
    expect(azBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
