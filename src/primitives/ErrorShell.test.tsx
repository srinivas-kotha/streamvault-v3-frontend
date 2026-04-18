/**
 * ErrorShell primitive — TDD tests (Task 1.6)
 *
 * RED first: ErrorShell.tsx returns null. All tests must fail.
 * GREEN: implement ErrorShell.tsx to pass all 4 assertions.
 *
 * Spec: plan Task 1.6 Step 1 + design spec §7.5 (D-pad default focus).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ErrorShell } from "./ErrorShell";

describe("ErrorShell", () => {
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

  it("Retry button is default focus and calls onRetry", async () => {
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
});
