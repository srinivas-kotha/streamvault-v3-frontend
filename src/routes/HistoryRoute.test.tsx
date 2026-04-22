/**
 * HistoryRoute tests (Phase 8)
 *
 * Covers:
 *  - Loading state
 *  - Empty state
 *  - Populated state with history items
 *  - CONTENT_AREA_HISTORY focusKey registered
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { HistoryItem } from "../api/schemas";

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

const mockUseWatchHistory = vi.hoisted(() =>
  vi.fn(() => ({
    history: [] as HistoryItem[],
    loading: false,
    error: null,
    record: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  })),
);

vi.mock("../features/history/useWatchHistory", () => ({
  useWatchHistory: mockUseWatchHistory,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

import { HistoryRoute } from "./HistoryRoute";

const mockHistoryItem: HistoryItem = {
  id: 1,
  content_type: "vod",
  content_id: 42,
  content_name: "Interstellar",
  content_icon: null,
  progress_seconds: 3600,
  duration_seconds: 7200,
  watched_at: new Date(Date.now() - 3600000).toISOString(),
};

describe("HistoryRoute", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
    mockUseWatchHistory.mockReturnValue({
      history: [],
      loading: false,
      error: null,
      record: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
    });
  });

  it("shows loading skeleton when loading", () => {
    mockUseWatchHistory.mockReturnValueOnce({
      history: [],
      loading: true,
      error: null,
      record: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
    });

    render(<HistoryRoute />);
    expect(screen.getByLabelText(/loading history/i)).toBeInTheDocument();
  });

  it("shows empty state when history is empty", () => {
    render(<HistoryRoute />);
    expect(
      screen.getByLabelText(/no watch history/i),
    ).toBeInTheDocument();
  });

  it("renders history items when populated", async () => {
    mockUseWatchHistory.mockReturnValueOnce({
      history: [mockHistoryItem],
      loading: false,
      error: null,
      record: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
    });

    render(<HistoryRoute />);

    await waitFor(() => {
      expect(screen.getByText("Interstellar")).toBeInTheDocument();
    });
  });

  it("shows page heading", () => {
    render(<HistoryRoute />);
    expect(
      screen.getByRole("heading", { name: /watch history/i }),
    ).toBeInTheDocument();
  });

  it("registers CONTENT_AREA_HISTORY focusKey", () => {
    render(<HistoryRoute />);
    expect(useFocusableSpy).toHaveBeenCalledWith(
      expect.objectContaining({ focusKey: "CONTENT_AREA_HISTORY" }),
    );
  });
});
