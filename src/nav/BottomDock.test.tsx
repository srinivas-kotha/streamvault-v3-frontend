// FIX: m4 — mock norigin in jsdom. useFocusable expects a real focus manager + native
// focus support that jsdom doesn't fully provide. Unit tests only assert ARIA + render;
// D-pad behaviour is covered by the Silk probe + BottomDock D-pad E2E tests.
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  init: vi.fn(),
  useFocusable: (opts?: { focusKey?: string; onEnterPress?: () => void }) => ({
    ref: { current: null },
    focusKey: opts?.focusKey ?? "MOCK_KEY",
    focused: false,
    focusSelf: vi.fn(),
  }),
  FocusContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  setFocus: vi.fn(),
}));

import { BottomDock } from "./BottomDock";

describe("BottomDock", () => {
  it("renders all 5 nav items", () => {
    render(<BottomDock activeItem="live" onNavigate={() => {}} />);
    expect(screen.getByRole("tab", { name: /live/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /movies/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /series/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /search/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /settings/i })).toBeInTheDocument();
  });
  it('active item has aria-selected="true"', () => {
    render(<BottomDock activeItem="live" onNavigate={() => {}} />);
    const liveTab = screen.getByRole("tab", { name: /live/i });
    expect(liveTab).toHaveAttribute("aria-selected", "true");
  });
  it('inactive items have aria-selected="false"', () => {
    render(<BottomDock activeItem="live" onNavigate={() => {}} />);
    expect(screen.getByRole("tab", { name: /movies/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
  it("has tablist role", () => {
    render(<BottomDock activeItem="live" onNavigate={() => {}} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
