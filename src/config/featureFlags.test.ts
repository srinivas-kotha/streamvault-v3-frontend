import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  refreshFlags,
  getFlag,
  clearFlagCache,
  __setCacheForTests,
} from "./featureFlags";

const STORAGE_KEY = "sv_feature_flags_v1";

function mockFetch(
  body: unknown,
  init?: { ok?: boolean; status?: number; reject?: boolean },
): void {
  const fetchMock = vi.fn(() => {
    if (init?.reject) return Promise.reject(new Error("network"));
    return Promise.resolve({
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      json: async () => body,
    } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
}

describe("featureFlags", () => {
  beforeEach(() => {
    clearFlagCache();
    localStorage.clear();
    vi.useFakeTimers({ now: new Date("2026-04-29T17:00:00Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearFlagCache();
    localStorage.clear();
  });

  it("getFlag returns defaultValue when no cache exists", () => {
    expect(getFlag("adaptive.player.tap_toggle", false)).toBe(false);
  });

  it("getFlag returns cached value when present", () => {
    __setCacheForTests({ "adaptive.player.tap_toggle": true });
    expect(getFlag("adaptive.player.tap_toggle", false)).toBe(true);
  });

  it("refreshFlags caches the response with 5s TTL", async () => {
    mockFetch({
      flags: { "adaptive.player.tap_toggle": true },
      scope: "global",
      ttl_seconds: 5,
      fetchedAt: "2026-04-29T17:00:00Z",
    });

    await refreshFlags();
    expect(getFlag("adaptive.player.tap_toggle", false)).toBe(true);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.expiresAt).toBe(Date.now() + 5000);
  });

  it("caps server-told TTL at 5 seconds (HARD_TTL)", async () => {
    mockFetch({
      flags: { foo: 1 },
      scope: "global",
      ttl_seconds: 999,
      fetchedAt: "2026-04-29T17:00:00Z",
    });

    await refreshFlags();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.expiresAt).toBe(Date.now() + 5000);
  });

  it("fail-closed on fetch error → returns empty map (no throw)", async () => {
    mockFetch({}, { reject: true });
    const result = await refreshFlags();
    expect(result).toEqual({});
  });

  it("fail-closed prefers stale cache over empty when fetch fails", async () => {
    __setCacheForTests({ stale: 1 }, 100);
    vi.advanceTimersByTime(200); // make it stale
    mockFetch({}, { reject: true });
    const result = await refreshFlags();
    expect(result).toEqual({ stale: 1 });
  });

  it("fail-closed on non-2xx → returns empty map", async () => {
    mockFetch({}, { ok: false, status: 500 });
    const result = await refreshFlags();
    expect(result).toEqual({});
  });

  it("fail-closed on malformed body → returns empty map", async () => {
    mockFetch({ wrong: "shape" });
    const result = await refreshFlags();
    expect(result).toEqual({});
  });

  it("coalesces concurrent refreshFlags calls", async () => {
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({
                flags: { foo: true },
                scope: "global",
                ttl_seconds: 5,
                fetchedAt: "2026-04-29T17:00:00Z",
              }),
            } as Response);
          }, 10);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p1 = refreshFlags();
    const p2 = refreshFlags();
    const p3 = refreshFlags();
    vi.advanceTimersByTime(20);
    await Promise.all([p1, p2, p3]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clearFlagCache wipes both mem and localStorage", async () => {
    mockFetch({
      flags: { foo: 1 },
      scope: "global",
      ttl_seconds: 5,
      fetchedAt: "2026-04-29T17:00:00Z",
    });
    await refreshFlags();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    clearFlagCache();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getFlag("foo", "default")).toBe("default");
  });
});
