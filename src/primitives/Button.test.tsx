/**
 * Button primitive — TDD tests (Task 1.4 + 2026-04-22 norigin retrofit)
 *
 * Covers: variants, sizes, disabled state, focus-ring class, default type.
 * Also: `focusKey` prop registers with norigin (2026-04-22).
 *
 * Spec: plan Task 1.4 + design spec §8 focus ring.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const useFocusableSpy = vi.hoisted(() => vi.fn());
vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  init: vi.fn(),
  useFocusable: (opts?: {
    focusable?: boolean;
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

import { Button } from "./Button";

describe("Button", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
  });

  it("renders label", () => {
    render(<Button>Play</Button>);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("calls onClick when pressed", async () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Play</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled prop set", () => {
    render(<Button disabled>Play</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders copper-bordered variant", () => {
    render(<Button variant="outlined">Back</Button>);
    expect(screen.getByRole("button").className).toContain("btn--outlined");
  });

  it("has visible text label (no icon-only without aria-label)", () => {
    render(<Button>Play</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Play");
  });

  it("does NOT fire onClick when disabled", async () => {
    const handler = vi.fn();
    render(
      <Button disabled onClick={handler}>
        Play
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("applies focus-ring class on every variant", () => {
    const { rerender } = render(<Button variant="primary">P</Button>);
    expect(screen.getByRole("button").className).toContain("focus-ring");

    rerender(<Button variant="outlined">O</Button>);
    expect(screen.getByRole("button").className).toContain("focus-ring");

    rerender(<Button variant="ghost">G</Button>);
    expect(screen.getByRole("button").className).toContain("focus-ring");
  });

  it("defaults to type=button to prevent accidental form submission", () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  // ─── 2026-04-22 norigin retrofit ─────────────────────────────────────────

  it("registers with norigin as a D-pad target when focusKey is provided", () => {
    render(<Button focusKey="TEST_KEY">Go</Button>);
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusable?: boolean; focusKey?: string; onEnterPress?: () => void }]
    >;
    const call = calls.find((c) => c[0]?.focusKey === "TEST_KEY");
    expect(call).toBeDefined();
    expect(call![0]).toMatchObject({ focusable: true, focusKey: "TEST_KEY" });
  });

  it("is NOT a D-pad target when focusKey is omitted (backwards-compat)", () => {
    render(<Button>No remote</Button>);
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusable?: boolean }]
    >;
    expect(calls[0]?.[0]?.focusable).toBe(false);
  });

  it("wires onEnterPress to norigin when focusKey is provided", () => {
    const handler = vi.fn();
    render(
      <Button focusKey="SUBMIT" onEnterPress={handler}>
        Go
      </Button>,
    );
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusKey?: string; onEnterPress?: () => void }]
    >;
    const call = calls.find((c) => c[0]?.focusKey === "SUBMIT");
    expect(call![0].onEnterPress).toBe(handler);
  });
});
