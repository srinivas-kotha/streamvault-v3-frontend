/**
 * sortMovies — persisted Movies sort preference + pure sort function.
 *
 * Keys per 03-movies.md §12:
 *   - sv_sort_movies = "added" | "name"   (forever, cleared on logout)
 *
 * "Added" is newest-first by the stream's `added` field (ISO string / numeric
 * timestamp string from Xtream — lexicographic comparison works for both).
 * Items missing `added` sink to the bottom so they never confuse the top row.
 *
 * "Name" is locale-aware via `localeCompare` so Telugu script sorts correctly.
 */
import type { VodStream } from "../../api/schemas";

export type MovieSortKey = "added" | "year" | "name";

const STORAGE_KEY = "sv_sort_movies";
const DEFAULT_SORT: MovieSortKey = "added";

function isValidSort(value: string): value is MovieSortKey {
  return value === "added" || value === "year" || value === "name";
}

export function getSortPref(): MovieSortKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v !== null && isValidSort(v)) return v;
  } catch {
    // private browsing / restricted — fall through
  }
  return DEFAULT_SORT;
}

export function setSortPref(sort: MovieSortKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, sort);
  } catch {
    // quota / restricted — swallow
  }
}

export function sortStreams(
  streams: readonly VodStream[],
  sort: MovieSortKey,
): VodStream[] {
  const copy = streams.slice();
  if (sort === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }
  if (sort === "year") {
    // Newest year first. Items with missing year sink to the bottom so the
    // top of the grid is always something concrete.
    copy.sort((a, b) => {
      const ay = a.year ? Number(a.year) : NaN;
      const by = b.year ? Number(b.year) : NaN;
      const aValid = Number.isFinite(ay);
      const bValid = Number.isFinite(by);
      if (aValid && bValid) return by - ay;
      if (aValid) return -1;
      if (bValid) return 1;
      return 0;
    });
    return copy;
  }
  // "added": newest-first by ISO string comparison. Items missing `added` sink.
  copy.sort((a, b) => {
    const aAdded = a.added ?? "";
    const bAdded = b.added ?? "";
    if (aAdded === bAdded) return 0;
    if (!aAdded) return 1;
    if (!bAdded) return -1;
    return bAdded.localeCompare(aAdded);
  });
  return copy;
}
