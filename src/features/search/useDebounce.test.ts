/**
 * useDebounce tests — covers the 300ms debounce timing.
 * Uses fake timers to avoid real waits.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does NOT update before the delay has elapsed", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "hello" } },
    );

    rerender({ value: "world" });

    // Advance by less than the delay
    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(result.current).toBe("hello");
  });

  it("updates after the delay has elapsed", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "hello" } },
    );

    rerender({ value: "world" });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("world");
  });

  it("resets the timer when value changes before delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "hello" } },
    );

    rerender({ value: "wo" });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Change again — should reset the 300ms window
    rerender({ value: "world" });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Only 200ms since last change — not yet updated
    expect(result.current).toBe("hello");

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Now 300ms since last change — updated
    expect(result.current).toBe("world");
  });
});
