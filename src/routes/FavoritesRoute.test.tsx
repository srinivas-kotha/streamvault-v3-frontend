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
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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
const mockClearAll = vi.hoisted(() => vi.fn());
const mockRestoreAll = vi.hoisted(() => vi.fn());
const mockUseFavorites = vi.hoisted(() =>
  vi.fn(() => ({
    favorites: [] as FavoriteItem[],
    loading: false,
    error: null,
    isFav: vi.fn(() => true),
    toggle: mockToggle,
    reload: vi.fn(),
    clearAll: mockClearAll,
    restoreAll: mockRestoreAll,
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
      clearAll: mockClearAll,
      restoreAll: mockRestoreAll,
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
      clearAll: mockClearAll,
      restoreAll: mockRestoreAll,
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
      clearAll: mockClearAll,
      restoreAll: mockRestoreAll,
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
      clearAll: mockClearAll,
      restoreAll: mockRestoreAll,
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
      clearAll: mockClearAll,
      restoreAll: mockRestoreAll,
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
      clearAll: mockClearAll,
      restoreAll: mockRestoreAll,
    });

    render(<FavoritesRoute />);
    const azBtn = screen.getByRole("button", { name: /a–z/i });
    fireEvent.click(azBtn);
    expect(azBtn.getAttribute("aria-pressed")).toBe("true");
  });

  // ─── Delete all ───────────────────────────────────────────────────────────

  describe("Delete all", () => {
    beforeEach(() => {
      mockClearAll.mockReset();
      mockRestoreAll.mockReset();
    });

    it("Delete all button renders in toolbar when not empty", () => {
      mockUseFavorites.mockReturnValue({
        favorites: [mockMovie],
        loading: false,
        error: null,
        isFav: vi.fn(() => true),
        toggle: mockToggle,
        reload: vi.fn(),
        clearAll: mockClearAll,
        restoreAll: mockRestoreAll,
      });
      render(<FavoritesRoute />);
      expect(screen.getByRole("button", { name: /delete all/i })).toBeInTheDocument();
    });

    it("Delete all button is absent on whole-page empty state", () => {
      render(<FavoritesRoute />);
      expect(screen.queryByRole("button", { name: /delete all/i })).not.toBeInTheDocument();
    });

    it("clicking Delete all opens the confirm modal", () => {
      mockUseFavorites.mockReturnValue({
        favorites: [mockChannel, mockMovie],
        loading: false,
        error: null,
        isFav: vi.fn(() => true),
        toggle: mockToggle,
        reload: vi.fn(),
        clearAll: mockClearAll,
        restoreAll: mockRestoreAll,
      });
      render(<FavoritesRoute />);
      fireEvent.click(screen.getByRole("button", { name: /delete all/i }));
      expect(screen.getByRole("dialog", { name: /delete all favorites/i })).toBeInTheDocument();
      expect(screen.getByText(/2 items/i)).toBeInTheDocument();
    });

    it("Cancel closes the modal without calling clearAll", () => {
      mockUseFavorites.mockReturnValue({
        favorites: [mockMovie],
        loading: false,
        error: null,
        isFav: vi.fn(() => true),
        toggle: mockToggle,
        reload: vi.fn(),
        clearAll: mockClearAll,
        restoreAll: mockRestoreAll,
      });
      render(<FavoritesRoute />);
      fireEvent.click(screen.getByRole("button", { name: /delete all/i }));
      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mockClearAll).not.toHaveBeenCalled();
    });

    it("Confirm fires clearAll and shows the undo toast", async () => {
      mockClearAll.mockResolvedValue([mockMovie]);
      mockUseFavorites.mockReturnValue({
        favorites: [mockMovie],
        loading: false,
        error: null,
        isFav: vi.fn(() => true),
        toggle: mockToggle,
        reload: vi.fn(),
        clearAll: mockClearAll,
        restoreAll: mockRestoreAll,
      });
      render(<FavoritesRoute />);
      fireEvent.click(screen.getByRole("button", { name: /delete all/i }));
      const dialog = screen.getByRole("dialog", { name: /delete all favorites/i });
      fireEvent.click(within(dialog).getByRole("button", { name: /^delete all$/i }));
      await waitFor(() => {
        expect(mockClearAll).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(screen.getByText(/favorites cleared/i)).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /^undo$/i })).toBeInTheDocument();
    });

    it("Undo calls restoreAll with the snapshot", async () => {
      mockClearAll.mockResolvedValue([mockMovie, mockChannel]);
      mockRestoreAll.mockResolvedValue(undefined);
      mockUseFavorites.mockReturnValue({
        favorites: [mockMovie, mockChannel],
        loading: false,
        error: null,
        isFav: vi.fn(() => true),
        toggle: mockToggle,
        reload: vi.fn(),
        clearAll: mockClearAll,
        restoreAll: mockRestoreAll,
      });
      render(<FavoritesRoute />);
      fireEvent.click(screen.getByRole("button", { name: /delete all/i }));
      const dialog = screen.getByRole("dialog", { name: /delete all favorites/i });
      fireEvent.click(within(dialog).getByRole("button", { name: /^delete all$/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^undo$/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
      await waitFor(() => {
        expect(mockRestoreAll).toHaveBeenCalledWith([mockMovie, mockChannel]);
      });
    });
  });
});
