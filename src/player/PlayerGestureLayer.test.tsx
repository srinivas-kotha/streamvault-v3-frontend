/**
 * PlayerGestureLayer unit tests (master plan §5 PR-FE-2).
 *
 * The jsdom test environment does not support TouchEvent by default; we
 * polyfill it in the same way as the existing inputMode tests (create Events
 * directly rather than using the constructor).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerGestureLayer } from "./PlayerGestureLayer";
import * as inputMode from "../nav/inputMode";

// ─── TouchEvent polyfill ─────────────────────────────────────────────────────

function makeTouch(overrides: Partial<Touch> = {}): Touch {
  return {
    identifier: 0,
    target: document.body,
    clientX: 100,
    clientY: 100,
    screenX: 100,
    screenY: 100,
    pageX: 100,
    pageY: 100,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
    altitudeAngle: 0,
    azimuthAngle: 0,
    touchType: "direct",
    ...overrides,
  } as Touch;
}

function makeTouchList(touches: Touch[]): TouchList {
  const list = {
    length: touches.length,
    item: (i: number) => touches[i] ?? null,
    [Symbol.iterator]: function* () {
      yield* touches;
    },
  } as unknown as TouchList;
  // Allow indexed access (0, 1, …)
  touches.forEach((t, i) => {
    (list as unknown as Record<number, Touch>)[i] = t;
  });
  return list;
}

function fireTouchStart(el: Element, touch: Touch) {
  const event = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "changedTouches", {
    value: makeTouchList([touch]),
  });
  el.dispatchEvent(event);
}

function fireTouchEnd(el: Element, touch: Touch) {
  const event = new Event("touchend", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "changedTouches", {
    value: makeTouchList([touch]),
  });
  el.dispatchEvent(event);
  return event;
}

function fireTouchCancel(el: Element, touch: Touch) {
  const event = new Event("touchcancel", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "changedTouches", {
    value: makeTouchList([touch]),
  });
  el.dispatchEvent(event);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PlayerGestureLayer", () => {
  let getInputModeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getInputModeSpy = vi
      .spyOn(inputMode, "getInputMode")
      .mockReturnValue("touch");
  });

  afterEach(() => {
    getInputModeSpy.mockRestore();
  });

  it("renders the overlay when not on TV", () => {
    const onTapToggle = vi.fn();
    render(<PlayerGestureLayer onTapToggle={onTapToggle} />);
    expect(screen.getByTestId("player-gesture-layer")).toBeTruthy();
  });

  it("returns null on TV (dpad mode)", () => {
    getInputModeSpy.mockReturnValue("dpad");
    const onTapToggle = vi.fn();
    const { container } = render(
      <PlayerGestureLayer onTapToggle={onTapToggle} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onTapToggle on a clean tap (< 300ms, < 10px)", () => {
    const onTapToggle = vi.fn();
    render(<PlayerGestureLayer onTapToggle={onTapToggle} />);
    const overlay = screen.getByTestId("player-gesture-layer");

    const touch = makeTouch({ identifier: 1, clientX: 200, clientY: 200 });
    fireTouchStart(overlay, touch);
    fireTouchEnd(overlay, touch);

    expect(onTapToggle).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onTapToggle when displacement exceeds 10px", () => {
    const onTapToggle = vi.fn();
    render(<PlayerGestureLayer onTapToggle={onTapToggle} />);
    const overlay = screen.getByTestId("player-gesture-layer");

    const start = makeTouch({ identifier: 2, clientX: 100, clientY: 100 });
    const end = makeTouch({ identifier: 2, clientX: 115, clientY: 100 });
    fireTouchStart(overlay, start);
    fireTouchEnd(overlay, end);

    expect(onTapToggle).not.toHaveBeenCalled();
  });

  it("does NOT call onTapToggle after touchcancel", () => {
    const onTapToggle = vi.fn();
    render(<PlayerGestureLayer onTapToggle={onTapToggle} />);
    const overlay = screen.getByTestId("player-gesture-layer");

    const touch = makeTouch({ identifier: 3 });
    fireTouchStart(overlay, touch);
    fireTouchCancel(overlay, touch);
    fireTouchEnd(overlay, touch);

    expect(onTapToggle).not.toHaveBeenCalled();
  });

  it("ignores touch on [data-player-control] elements", () => {
    const onTapToggle = vi.fn();
    const { container } = render(
      <div>
        <button data-player-control>Play</button>
        <PlayerGestureLayer onTapToggle={onTapToggle} />
      </div>,
    );
    const btn = container.querySelector("button[data-player-control]")!;
    const touch = makeTouch({ identifier: 4, target: btn });

    // Simulate touch on the button (target is the button)
    const startEvent = new Event("touchstart", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(startEvent, "changedTouches", {
      value: makeTouchList([touch]),
    });
    btn.dispatchEvent(startEvent);

    const endEvent = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(endEvent, "changedTouches", {
      value: makeTouchList([touch]),
    });
    // target of endEvent is button (has [data-player-control])
    Object.defineProperty(endEvent, "target", { value: btn });
    const overlay = screen.getByTestId("player-gesture-layer");
    overlay.dispatchEvent(endEvent);

    expect(onTapToggle).not.toHaveBeenCalled();
  });

  it("calls preventDefault on touchend for a valid tap (ghost-click prevention)", () => {
    const onTapToggle = vi.fn();
    render(<PlayerGestureLayer onTapToggle={onTapToggle} />);
    const overlay = screen.getByTestId("player-gesture-layer");

    const touch = makeTouch({ identifier: 5, clientX: 50, clientY: 50 });
    fireTouchStart(overlay, touch);
    const endEvent = fireTouchEnd(overlay, touch);

    // preventDefault should have been called on the touchend event.
    expect(endEvent.defaultPrevented).toBe(true);
  });

  it("handles mismatched touch identifier gracefully (no crash, no toggle)", () => {
    const onTapToggle = vi.fn();
    render(<PlayerGestureLayer onTapToggle={onTapToggle} />);
    const overlay = screen.getByTestId("player-gesture-layer");

    const start = makeTouch({ identifier: 6, clientX: 10, clientY: 10 });
    const endDifferentId = makeTouch({
      identifier: 99,
      clientX: 10,
      clientY: 10,
    });
    fireTouchStart(overlay, start);
    fireTouchEnd(overlay, endDifferentId);

    expect(onTapToggle).not.toHaveBeenCalled();
  });
});
