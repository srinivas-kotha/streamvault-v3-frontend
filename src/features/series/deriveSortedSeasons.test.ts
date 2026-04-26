/**
 * Unit tests for `deriveSortedSeasons` — the union helper that powers the
 * Series Detail season rail.
 *
 * Background: some Xtream upstreams return `seasons: []` while still
 * populating `episodes: { "1": [...], "2": [...] }`. Pre-fix, the rail and
 * the episode-header row both vanished because they were gated on
 * `info.seasons.length > 0`. Post-fix, the rail is derived from the union
 * of `Object.keys(info.episodes)` and `info.seasons[].seasonNumber`, with
 * `info.seasons[i]` left-joined for `name` / `icon` enrichment.
 */
import { describe, it, expect } from "vitest";
import { deriveSortedSeasons } from "./deriveSortedSeasons";
import type { SeriesInfo, EpisodeInfo } from "../../api/schemas";

function ep(id: string, episodeNumber: number): EpisodeInfo {
  return { id, episodeNumber, title: `Ep ${episodeNumber}` };
}

function makeInfo(
  partial: Pick<SeriesInfo, "seasons" | "episodes">,
): SeriesInfo {
  return {
    id: "s1",
    name: "Test Series",
    categoryId: "0",
    seasons: partial.seasons,
    episodes: partial.episodes,
  } as SeriesInfo;
}

describe("deriveSortedSeasons", () => {
  it("returns [] when info is null", () => {
    expect(deriveSortedSeasons(null)).toEqual([]);
  });

  it("derives seasons from episodes keys when upstream seasons[] is empty", () => {
    const info = makeInfo({
      seasons: [],
      episodes: {
        "1": [ep("e1", 1), ep("e2", 2)],
        "2": [ep("e3", 1)],
      },
    });

    const result = deriveSortedSeasons(info);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      seasonNumber: 1,
      name: "",
      episodeCount: 2,
    });
    expect(result[1]).toMatchObject({
      seasonNumber: 2,
      name: "",
      episodeCount: 1,
    });
  });

  it("enriches with provided seasons[] entry when present and synthesizes the rest", () => {
    const info = makeInfo({
      seasons: [
        { seasonNumber: 1, name: "Season 1", episodeCount: 0, icon: "s1.jpg" },
      ],
      episodes: {
        "1": [ep("e1", 1)],
        "2": [ep("e2", 1), ep("e3", 2)],
      },
    });

    const result = deriveSortedSeasons(info);

    expect(result).toHaveLength(2);
    // Season 1: enriched (keeps name + icon, episodeCount overridden by
    // actual episodes-map length).
    expect(result[0]).toMatchObject({
      seasonNumber: 1,
      name: "Season 1",
      icon: "s1.jpg",
      episodeCount: 1,
    });
    // Season 2: synthesized (empty name, episodeCount from episodes map).
    expect(result[1]).toMatchObject({
      seasonNumber: 2,
      name: "",
      episodeCount: 2,
    });
  });

  it("passes through the normal full-data case unchanged in count + ordering", () => {
    const info = makeInfo({
      seasons: [
        { seasonNumber: 1, name: "Season 1", episodeCount: 2 },
        { seasonNumber: 2, name: "Season 2", episodeCount: 1 },
      ],
      episodes: {
        "1": [ep("e1", 1), ep("e2", 2)],
        "2": [ep("e3", 1)],
      },
    });

    const result = deriveSortedSeasons(info);

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.seasonNumber)).toEqual([1, 2]);
    expect(result[0]?.name).toBe("Season 1");
    expect(result[1]?.name).toBe("Season 2");
  });

  it("includes a season provided in seasons[] even when episodes is missing the key", () => {
    // Degenerate but correct: spec calls out that a seasons[] entry without
    // episodes should still surface (so the user sees the empty-season UI
    // rather than silently dropping it).
    const info = makeInfo({
      seasons: [{ seasonNumber: 3, name: "Season 3", episodeCount: 0 }],
      episodes: {
        "1": [ep("e1", 1)],
      },
    });

    const result = deriveSortedSeasons(info);

    expect(result.map((s) => s.seasonNumber)).toEqual([1, 3]);
    expect(result.find((s) => s.seasonNumber === 3)).toMatchObject({
      name: "Season 3",
      episodeCount: 0,
    });
  });

  it("sorts Specials (season 0) last via existing sortSeasons", () => {
    const info = makeInfo({
      seasons: [],
      episodes: {
        "0": [ep("sp1", 1)],
        "1": [ep("e1", 1)],
        "2": [ep("e2", 1)],
      },
    });

    const result = deriveSortedSeasons(info);

    expect(result.map((s) => s.seasonNumber)).toEqual([1, 2, 0]);
  });

  it("ignores episodes-map keys that don't parse to a finite number", () => {
    const info = makeInfo({
      seasons: [],
      episodes: {
        "1": [ep("e1", 1)],
        garbage: [ep("eX", 1)],
      } as unknown as SeriesInfo["episodes"],
    });

    const result = deriveSortedSeasons(info);

    expect(result.map((s) => s.seasonNumber)).toEqual([1]);
  });
});
