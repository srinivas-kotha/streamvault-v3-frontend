import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { InputModeErrorBoundary } from "./InputModeErrorBoundary";

function ThrowOnRender(): never {
  throw new Error("kaboom");
}

afterEach(() => {
  document.documentElement.removeAttribute("data-input-mode");
});

describe("InputModeErrorBoundary", () => {
  it("catches a render-time error and forces dpad mode", () => {
    // Suppress React's noisy error boundary console output during this test.
    const orig = console.error;
    console.error = vi.fn();
    try {
      render(
        <InputModeErrorBoundary>
          <ThrowOnRender />
        </InputModeErrorBoundary>,
      );
      expect(document.documentElement.getAttribute("data-input-mode")).toBe(
        "dpad",
      );
    } finally {
      console.error = orig;
    }
  });

  it("renders children when no error", () => {
    const { getByText } = render(
      <InputModeErrorBoundary>
        <p>hello</p>
      </InputModeErrorBoundary>,
    );
    expect(getByText("hello")).toBeTruthy();
  });
});
