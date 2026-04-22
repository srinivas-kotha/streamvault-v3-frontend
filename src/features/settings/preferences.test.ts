/**
 * preferences.test.ts — get/set round-trip, defaults, subscription
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPrefs, setPref, subscribePref } from "./preferences";

beforeEach(() => {
  localStorage.clear();
});

describe("getPrefs defaults", () => {
  it("returns factory defaults when localStorage is empty", () => {
    const prefs = getPrefs();
    expect(prefs.subtitle).toBe("off");
    expect(prefs.audio).toBe("auto");
    expect(prefs.quality).toBe("auto");
    expect(prefs.autoplay).toBe("on");
  });
});

describe("setPref / getPrefs round-trip", () => {
  it("persists subtitle language", () => {
    setPref("subtitle", "hi");
    expect(getPrefs().subtitle).toBe("hi");
    expect(localStorage.getItem("sv_pref_subtitle")).toBe("hi");
  });

  it("persists audio language", () => {
    setPref("audio", "te");
    expect(getPrefs().audio).toBe("te");
    expect(localStorage.getItem("sv_pref_audio")).toBe("te");
  });

  it("persists video quality", () => {
    setPref("quality", "720p");
    expect(getPrefs().quality).toBe("720p");
    expect(localStorage.getItem("sv_pref_quality")).toBe("720p");
  });

  it("persists autoplay", () => {
    setPref("autoplay", "off");
    expect(getPrefs().autoplay).toBe("off");
    expect(localStorage.getItem("sv_pref_autoplay")).toBe("off");
  });
});

describe("subscribePref", () => {
  it("fires listener when a pref changes", () => {
    const spy = vi.fn();
    const unsub = subscribePref(spy);

    setPref("subtitle", "en");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].subtitle).toBe("en");

    unsub();
    setPref("subtitle", "ta");
    // After unsubscribe, should not fire again
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("passes full prefs snapshot to listener", () => {
    setPref("audio", "hi");
    const spy = vi.fn();
    subscribePref(spy);

    setPref("quality", "1080p");
    const snapshot = spy.mock.calls[0][0];
    expect(snapshot.audio).toBe("hi"); // previously set
    expect(snapshot.quality).toBe("1080p");
  });
});
