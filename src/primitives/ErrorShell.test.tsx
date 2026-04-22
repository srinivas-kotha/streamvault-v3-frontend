/**
 * ErrorShell primitive — TDD tests (Task 1.6 + 2026-04-22 norigin retrofit)
 *
 * Covers: title/subtext render, Retry click handler, Back button conditional,
 * role=alert. Also: setFocus("ERROR_RETRY") on mount, focusKey wiring on all
 * three buttons (2026-04-22 — replaces the broken `autoFocus` pattern).
 *
 * Spec: plan Task 1.6 + design spec §7.5 (D-pad default focus).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const useFocusableSpy = vi.hoisted(() => vi.fn());
const setFocusSpy = vi.hoisted(() => vi.fn());
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
  setFocus: setFocusSpy,
}));

import { ErrorShell } from "./ErrorShell";

describe("ErrorShell", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
    setFocusSpy.mockClear();
  });

  it("renders title and subtext", () => {
    render(
      <ErrorShell
        title="Can't load channels"
        subtext="Check your connection"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText("Can't load channels")).toBeInTheDocument();
    expect(screen.getByText("Check your connection")).toBeInTheDocument();
  });

  it("Retry button calls onRetry on click", async () => {
    const retry = vi.fn();
    render(<ErrorShell title="Error" subtext="Try again" onRetry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders Back button when onBack provided", () => {
    render(
      <ErrorShell
        title="Not found"
        subtext="Go back"
        onRetry={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("has role=alert for screen readers", () => {
    render(<ErrorShell title="Error" subtext="msg" onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  // ─── 2026-04-22 norigin retrofit ─────────────────────────────────────────

  it("primes norigin to focus ERROR_RETRY on mount", () => {
    render(<ErrorShell title="Error" subtext="msg" onRetry={() => {}} />);
    expect(setFocusSpy).toHaveBeenCalledWith("ERROR_RETRY");
  });

  it("registers ERROR_RETRY as a norigin focus key", () => {
    render(<ErrorShell title="Error" subtext="msg" onRetry={() => {}} />);
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusable?: boolean; focusKey?: string; onEnterPress?: () => void }]
    >;
    const retryCall = calls.find((c) => c[0]?.focusKey === "ERROR_RETRY");
    expect(retryCall).toBeDefined();
    expect(retryCall![0]).toMatchObject({
      focusable: true,
      focusKey: "ERROR_RETRY",
    });
  });

  it("registers ERROR_BACK when onBack provided", () => {
    render(
      <ErrorShell
        title="E"
        subtext="s"
        onRetry={() => {}}
        onBack={() => {}}
      />,
    );
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusKey?: string }]
    >;
    const backCall = calls.find((c) => c[0]?.focusKey === "ERROR_BACK");
    expect(backCall).toBeDefined();
  });

  it("registers ERROR_REPORT when onReport provided", () => {
    render(
      <ErrorShell
        title="E"
        subtext="s"
        onRetry={() => {}}
        onReport={() => {}}
      />,
    );
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusKey?: string }]
    >;
    const reportCall = calls.find((c) => c[0]?.focusKey === "ERROR_REPORT");
    expect(reportCall).toBeDefined();
  });

  it("wires onEnterPress for Retry to the onRetry callback", () => {
    const retry = vi.fn();
    render(<ErrorShell title="E" subtext="s" onRetry={retry} />);
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusKey?: string; onEnterPress?: () => void }]
    >;
    const retryCall = calls.find((c) => c[0]?.focusKey === "ERROR_RETRY");
    expect(retryCall![0].onEnterPress).toBe(retry);
  });
});
