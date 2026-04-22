/**
 * SearchRoute tests (Phase 7)
 *
 * Scope:
 *  - Typing < 2 chars shows help text.
 *  - Typing 2+ chars triggers fetch (debounce mocked to passthrough).
 *  - Loading state renders skeleton.
 *  - Successful results render grouped sections.
 *  - Empty state shown when 2+ chars and zero results.
 *  - Error shown gracefully on fetch failure.
 *  - useFocusable registered with CONTENT_AREA_SEARCH and SEARCH_INPUT.
 *  - Result cards registered with SEARCH_RESULT_<TYPE>_<ID> focus keys.
 *
 * Debounce is mocked to passthrough — the 300ms timing is covered by
 * useDebounce's own unit tests (useDebounce.test.ts).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { SearchResults } from "../api/schemas";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const useFocusableSpy = vi.hoisted(() => vi.fn());
vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
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

const fetchSearchMock = vi.hoisted(() => vi.fn());
vi.mock("../api/search", () => ({
  fetchSearch: fetchSearchMock,
}));

// Mock useDebounce to return value immediately — removes the 300ms timer
// dependency from component tests; debounce timing is tested separately.
vi.mock("../features/search/useDebounce", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useDebounce: (value: unknown) => value as any,
}));

// react-router-dom mock — useNavigate
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

// Player opener used by SearchResultsSection for Enter-to-play.
const openPlayerMock = vi.hoisted(() => vi.fn());
vi.mock("../player", () => ({
  usePlayerOpener: () => ({ openPlayer: openPlayerMock }),
}));

import { SearchRoute } from "./SearchRoute";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const emptyResults: SearchResults = { live: [], vod: [], series: [] };

const fullResults: SearchResults = {
  live: [
    {
      id: "l1",
      name: "CNN Live",
      type: "live",
      categoryId: "news",
      icon: null,
      added: null,
      isAdult: false,
    },
  ],
  vod: [
    {
      id: "v1",
      name: "Inception",
      type: "vod",
      categoryId: "movies",
      icon: null,
      added: null,
      isAdult: false,
    },
  ],
  series: [
    {
      id: "s1",
      name: "Breaking Bad",
      type: "series",
      categoryId: "drama",
      icon: null,
      added: null,
      isAdult: false,
    },
  ],
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("SearchRoute", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    useFocusableSpy.mockClear();
    fetchSearchMock.mockReset();
    navigateMock.mockReset();
  });

  it("registers CONTENT_AREA_SEARCH and SEARCH_INPUT with useFocusable", () => {
    fetchSearchMock.mockResolvedValue(emptyResults);
    render(<SearchRoute />);
    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);
    expect(keys).toContain("CONTENT_AREA_SEARCH");
    expect(keys).toContain("SEARCH_INPUT");
  });

  it("shows help text when query is 1 character", async () => {
    fetchSearchMock.mockResolvedValue(emptyResults);
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "a");
    expect(
      screen.getByText(/type at least 2 characters/i),
    ).toBeInTheDocument();
    expect(fetchSearchMock).not.toHaveBeenCalled();
  });

  it("does NOT show help text when query is empty", () => {
    fetchSearchMock.mockResolvedValue(emptyResults);
    render(<SearchRoute />);
    expect(
      screen.queryByText(/type at least 2 characters/i),
    ).not.toBeInTheDocument();
  });

  it("triggers fetch when query reaches 2+ chars (debounce passthrough)", async () => {
    fetchSearchMock.mockResolvedValue(fullResults);
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "cn");

    await waitFor(() => {
      expect(fetchSearchMock).toHaveBeenCalledWith("cn");
    });
  });

  it("does NOT fetch when query has only 1 char", async () => {
    fetchSearchMock.mockResolvedValue(emptyResults);
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "c");
    // Small delay to let any microtasks settle
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSearchMock).not.toHaveBeenCalled();
  });

  it("shows loading skeleton while fetch is in-flight", async () => {
    // Never resolves
    fetchSearchMock.mockReturnValue(new Promise(() => {}));
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "cn");

    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
    });
  });

  it("renders grouped sections after successful fetch", async () => {
    fetchSearchMock.mockResolvedValue(fullResults);
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "cn");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "CNN Live" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Inception" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Breaking Bad" })).toBeInTheDocument();
  });

  it("shows Live / Movies / Series section labels", async () => {
    fetchSearchMock.mockResolvedValue(fullResults);
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "cn");

    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument();
    });
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.getByText("Series")).toBeInTheDocument();
  });

  it("shows empty state when results are all empty for 2+ char query", async () => {
    fetchSearchMock.mockResolvedValue(emptyResults);
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "xyz");

    await waitFor(() => {
      expect(screen.getByText(/no results for/i)).toBeInTheDocument();
    });
  });

  it("shows error message when fetch rejects", async () => {
    fetchSearchMock.mockRejectedValue(new Error("network error"));
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "cn");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/search failed/i);
  });

  it("clears results when query drops below 2 chars", async () => {
    fetchSearchMock.mockResolvedValue(fullResults);
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "cn");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "CNN Live" })).toBeInTheDocument();
    });

    // Clear input back to 1 char
    await user.clear(input);
    await user.type(input, "c");

    expect(
      screen.queryByRole("button", { name: "CNN Live" }),
    ).not.toBeInTheDocument();
  });

  it("result card registers SEARCH_RESULT_<TYPE>_<ID> focus keys", async () => {
    fetchSearchMock.mockResolvedValue(fullResults);
    render(<SearchRoute />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "cn");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "CNN Live" })).toBeInTheDocument();
    });

    const keys = useFocusableSpy.mock.calls
      .map((call) => call[0]?.focusKey)
      .filter(Boolean);
    expect(keys).toContain("SEARCH_RESULT_LIVE_l1");
    expect(keys).toContain("SEARCH_RESULT_VOD_v1");
    expect(keys).toContain("SEARCH_RESULT_SERIES_s1");
  });
});
