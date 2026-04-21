import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock norigin — useFocusable returns ref + focused state + focusSelf
const mockFocusSelf = vi.hoisted(() => vi.fn());
vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  useFocusable: vi.fn(({ focusKey }: { focusKey: string }) => ({
    ref: { current: null },
    focused: focusKey === "TL", // TL starts focused in probe
    focusKey,
    focusSelf: mockFocusSelf,
  })),
  FocusContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  setFocus: vi.fn(), // global setFocus — used for deterministic initial TL focus
}));

import { SilkProbe } from "./SilkProbe";

describe("SilkProbe", () => {
  it("renders all 4 probe cards (TL / TR / BL / BR)", () => {
    render(<SilkProbe />);
    // aria-label is stable (plain label) so Playwright can assert document.activeElement
    expect(screen.getByRole("button", { name: "TL" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "TR" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "BL" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "BR" })).toBeTruthy();
  });

  it("shows copper background on focused card (TL starts focused)", () => {
    render(<SilkProbe />);
    // TL is focused (mocked) — button content shows ✓ TL
    const tlButton = screen.getByRole("button", { name: "TL" });
    expect(tlButton).toBeTruthy();
    // Check inline style applied the copper accent
    expect(tlButton.style.background).toBe("var(--accent-copper)");
  });

  it("has a heading describing the probe", () => {
    render(<SilkProbe />);
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("renders a key-event log (pre element)", () => {
    render(<SilkProbe />);
    expect(document.querySelector("pre")).toBeTruthy();
  });
});
