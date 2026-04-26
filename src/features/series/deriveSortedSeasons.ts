/**
 * deriveSortedSeasons — union helper for the Series Detail season rail.
 *
 * Background: some Xtream upstreams return `seasons: []` while still
 * populating `episodes: { "1": [...], "2": [...] }`. Pre-fix, the rail
 * and the episode-header row both vanished because they were gated on
 * `info.seasons.length > 0`.
 *
 * Source-of-truth for *which* seasons exist is `Object.keys(info.episodes)`.
 * For each unique season number we left-join `info.seasons[i]` to enrich
 * with `name` / `icon`. When absent we synthesize a SeasonInfo with an
 * empty `name` (so `seasonLabel()` falls through to "Season N") and a
 * computed `episodeCount` from `info.episodes[String(sn)]?.length`.
 *
 * Spec: docs/ux/02-series.md §6.2.
 */
import type { SeriesInfo, SeasonInfo } from "../../api/schemas";

export function sortSeasons(seasons: SeasonInfo[]): SeasonInfo[] {
  return [...seasons].sort((a, b) => {
    if (a.seasonNumber === 0) return 1;
    if (b.seasonNumber === 0) return -1;
    return a.seasonNumber - b.seasonNumber;
  });
}

export function deriveSortedSeasons(info: SeriesInfo | null): SeasonInfo[] {
  if (!info) return [];

  const episodesMap = info.episodes ?? {};
  const providedSeasons = info.seasons ?? [];

  const byNumber = new Map<number, SeasonInfo>();
  for (const s of providedSeasons) {
    byNumber.set(s.seasonNumber, s);
  }

  const seasonNumbers = new Set<number>();
  for (const key of Object.keys(episodesMap)) {
    const n = Number(key);
    if (Number.isFinite(n)) seasonNumbers.add(n);
  }
  for (const s of providedSeasons) {
    seasonNumbers.add(s.seasonNumber);
  }

  const merged: SeasonInfo[] = [];
  for (const sn of seasonNumbers) {
    const provided = byNumber.get(sn);
    const epCount = episodesMap[String(sn)]?.length ?? 0;
    if (provided) {
      // Trust provided name/icon; prefer episodesMap length when available
      // (upstream `episodeCount` sometimes lies / is stale).
      merged.push({
        ...provided,
        episodeCount: epCount > 0 ? epCount : provided.episodeCount,
      });
    } else {
      merged.push({
        seasonNumber: sn,
        name: "",
        episodeCount: epCount,
      });
    }
  }

  return sortSeasons(merged);
}
