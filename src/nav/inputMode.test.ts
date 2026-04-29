import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getInputMode,
  initInputMode,
  onInputModeChange,
  __resetForTests,
} from "./inputMode";

describe("inputMode", () => {
  beforeEach(() => {
    __resetForTests();
    document.documentElement.removeAttribute("data-tv");
  });

  afterEach(() => {
    __resetForTests();
    document.documentElement.removeAttribute("data-tv");
    document.documentElement.removeAttribute("data-input-mode");
  });

  it("defaults to keyboard mode pre-init", () => {
    expect(getInputMode()).toBe("keyboard");
  });

  it("initialises to dpad on TV (terminal)", () => {
    document.documentElement.setAttribute("data-tv", "true");
    initInputMode();
    expect(getInputMode()).toBe("dpad");
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "dpad",
    );
  });

  it("TV mode is terminal — touch event does not change mode", async () => {
    document.documentElement.setAttribute("data-tv", "true");
    initInputMode();
    const event = new Event("touchstart");
    window.dispatchEvent(event);
    expect(getInputMode()).toBe("dpad");
  });

  it("notifies subscribers on mode change", async () => {
    initInputMode();
    let notified: string | null = null;
    onInputModeChange((m) => {
      notified = m;
    });
    // Advance past the throttle
    await new Promise((r) => setTimeout(r, 110));
    window.dispatchEvent(new Event("touchstart"));
    expect(notified).toBe("touch");
  });

  it("unsubscribe stops notifications", async () => {
    initInputMode();
    let notified: string | null = null;
    const off = onInputModeChange((m) => {
      notified = m;
    });
    off();
    await new Promise((r) => setTimeout(r, 110));
    window.dispatchEvent(new Event("touchstart"));
    expect(notified).toBeNull();
  });

  it("idempotent init — second call is a no-op", () => {
    initInputMode();
    const before = document.documentElement.getAttribute("data-input-mode");
    initInputMode();
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      before,
    );
  });

  it("handles missing matchMedia gracefully (Silk fallback)", () => {
    const orig = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => {
        throw new Error("not supported");
      },
    });
    try {
      __resetForTests();
      // Should not throw and should land on keyboard default.
      expect(() => initInputMode()).not.toThrow();
      expect(getInputMode()).toBe("keyboard");
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: orig,
      });
    }
  });
});
