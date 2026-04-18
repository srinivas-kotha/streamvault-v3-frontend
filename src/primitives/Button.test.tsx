/**
 * Button primitive — TDD tests (Task 1.4)
 *
 * RED first: Button does not exist yet. All tests must fail.
 * GREEN: implement Button.tsx to pass all 5 assertions.
 *
 * Spec: plan Task 1.4 Step 1 + design spec §8 focus ring.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
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
});
