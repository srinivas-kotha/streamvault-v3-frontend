/**
 * Card primitive — TDD tests (Task 1.5)
 *
 * RED first: Card stub returns null. Tests must fail on assertion mismatches.
 * GREEN: implement Card.tsx to pass all 3 assertions.
 *
 * Spec: plan Task 1.5 + design spec §card.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Content</Card>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("has bg-surface background by default", () => {
    const { container } = render(<Card>X</Card>);
    expect(container.firstChild).toHaveStyle("background: var(--bg-surface)");
  });

  it("applies focus-ring class and renders as button when focusable", () => {
    const { container } = render(<Card focusable>X</Card>);
    expect((container.firstChild as HTMLElement).className).toContain(
      "focus-ring",
    );
    expect(container.firstChild?.nodeName.toLowerCase()).toBe("button");
  });
});
