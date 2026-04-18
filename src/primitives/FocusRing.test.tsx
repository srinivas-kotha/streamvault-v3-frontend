import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FocusRing } from "./FocusRing";

describe("FocusRing", () => {
  it("renders children without a wrapper element", () => {
    render(
      <FocusRing>
        <button>Play</button>
      </FocusRing>,
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  // FocusRing uses React.cloneElement — no wrapper div.
  // The focus-ring class is injected onto the child itself.
  it("applies focus-ring class when variant is default (omitted)", () => {
    render(
      <FocusRing>
        <button>Play</button>
      </FocusRing>,
    );
    const btn = screen.getByRole("button", { name: "Play" });
    expect(btn.className).toContain("focus-ring");
  });

  it("applies both focus-ring and focus-ring--imagery when variant='imagery'", () => {
    render(
      <FocusRing variant="imagery">
        <button>Action</button>
      </FocusRing>,
    );
    const btn = screen.getByRole("button", { name: "Action" });
    expect(btn.className).toContain("focus-ring");
    expect(btn.className).toContain("focus-ring--imagery");
  });

  it("preserves child ref for spatial-nav chain", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <FocusRing>
        <button ref={ref}>Play</button>
      </FocusRing>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe("Play");
  });

  it("preserves existing child className alongside focus-ring", () => {
    render(
      <FocusRing>
        <button className="tile">Play</button>
      </FocusRing>,
    );
    const btn = screen.getByRole("button", { name: "Play" });
    expect(btn.className).toContain("tile");
    expect(btn.className).toContain("focus-ring");
  });
});
