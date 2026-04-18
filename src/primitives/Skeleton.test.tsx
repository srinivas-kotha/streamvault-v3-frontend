/**
 * Skeleton primitive — TDD tests (Task 1.5)
 *
 * RED first: Skeleton stub returns null. Tests must fail on assertion mismatches.
 * GREEN: implement Skeleton.tsx to pass all 2 assertions.
 *
 * Spec: plan Task 1.5 + design spec §skeleton.
 */
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<Skeleton width="100%" height={200} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("has aria-hidden true (decorative)", () => {
    const { container } = render(<Skeleton width={100} height={20} />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
