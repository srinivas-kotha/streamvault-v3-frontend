/**
 * useLangPref — unit tests.
 *
 * Covers:
 *  - initial read of sv_lang_pref with default "telugu" fallback
 *  - write + read round-trip through the hook
 *  - excludeSports mapping (stored "sports" → read "all")
 *  - excludeSports write refusal (set("sports") is a no-op)
 *  - cross-tab sync via the storage event
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useLangPref } from "./useLangPref";

describe("useLangPref", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to 'telugu' when nothing is stored", () => {
    const { result } = renderHook(() => useLangPref());
    expect(result.current[0]).toBe("telugu");
  });

  it("reads the stored preference", () => {
    localStorage.setItem("sv_lang_pref", "hindi");
    const { result } = renderHook(() => useLangPref());
    expect(result.current[0]).toBe("hindi");
  });

  it("round-trips a write through the setter", () => {
    const { result } = renderHook(() => useLangPref());
    act(() => result.current[1]("english"));
    expect(result.current[0]).toBe("english");
    expect(localStorage.getItem("sv_lang_pref")).toBe("english");
  });

  it("maps 'sports' to 'all' on read when excludeSports is true", () => {
    localStorage.setItem("sv_lang_pref", "sports");
    const { result } = renderHook(() => useLangPref({ excludeSports: true }));
    expect(result.current[0]).toBe("all");
    // Storage must not be mutated — Live may still hold "sports".
    expect(localStorage.getItem("sv_lang_pref")).toBe("sports");
  });

  it("refuses to write 'sports' when excludeSports is true", () => {
    localStorage.setItem("sv_lang_pref", "hindi");
    const { result } = renderHook(() => useLangPref({ excludeSports: true }));
    act(() => result.current[1]("sports"));
    expect(result.current[0]).toBe("hindi");
    expect(localStorage.getItem("sv_lang_pref")).toBe("hindi");
  });

  it("reacts to cross-tab storage events", () => {
    const { result } = renderHook(() => useLangPref());
    expect(result.current[0]).toBe("telugu");

    act(() => {
      localStorage.setItem("sv_lang_pref", "english");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "sv_lang_pref",
          newValue: "english",
        }),
      );
    });

    expect(result.current[0]).toBe("english");
  });

  it("ignores storage events for unrelated keys", () => {
    const { result } = renderHook(() => useLangPref());
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "something_else", newValue: "x" }),
      );
    });
    expect(result.current[0]).toBe("telugu");
  });
});
