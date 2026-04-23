import { describe, it, expect, beforeEach } from "vitest";
import { getSortPref, setSortPref, sortStreams } from "./sortMovies";
import type { VodStream } from "../../api/schemas";

function mk(id: string, overrides: Partial<VodStream> = {}): VodStream {
  return {
    id,
    name: id,
    type: "vod",
    categoryId: "c1",
    ...overrides,
  };
}

describe("sortMovies prefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to 'added' when no preference is stored", () => {
    expect(getSortPref()).toBe("added");
  });

  it("round-trips a stored preference", () => {
    setSortPref("name");
    expect(getSortPref()).toBe("name");
  });

  it("ignores invalid stored values and falls back to 'added'", () => {
    localStorage.setItem("sv_sort_movies", "year");
    expect(getSortPref()).toBe("added");
  });
});

describe("sortStreams", () => {
  it("sorts by name case-and-locale-aware ascending", () => {
    const out = sortStreams(
      [mk("1", { name: "Zeta" }), mk("2", { name: "alpha" }), mk("3", { name: "Beta" })],
      "name",
    );
    expect(out.map((s) => s.name)).toEqual(["alpha", "Beta", "Zeta"]);
  });

  it("sorts by added newest-first (lexicographic on ISO string)", () => {
    const out = sortStreams(
      [
        mk("1", { added: "2024-01-01T00:00:00Z" }),
        mk("2", { added: "2026-04-01T00:00:00Z" }),
        mk("3", { added: "2025-06-15T00:00:00Z" }),
      ],
      "added",
    );
    expect(out.map((s) => s.id)).toEqual(["2", "3", "1"]);
  });

  it("sinks items missing `added` to the bottom under 'added' sort", () => {
    const out = sortStreams(
      [
        mk("1"),
        mk("2", { added: "2026-04-01T00:00:00Z" }),
        mk("3", { added: null }),
      ],
      "added",
    );
    expect(out.map((s) => s.id)).toEqual(["2", "1", "3"]);
  });

  it("does not mutate the input array", () => {
    const input = [mk("1", { name: "b" }), mk("2", { name: "a" })];
    const snapshot = input.slice();
    sortStreams(input, "name");
    expect(input).toEqual(snapshot);
  });
});
