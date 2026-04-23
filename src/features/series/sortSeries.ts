/**
 * sortSeries — persisted Series sort preference + pure sort function.
 *
 * Key per 02-series.md §10:  sv_sort_series = "added" | "name"  (forever)
 *
 * "added" sorts newest-first by ISO `added` string (lexicographic works for
 * ISO-8601 and numeric epoch strings alike). Items missing `added` sink.
 * "name" uses localeCompare so Telugu / Hindi script sort correctly.
 */
import type { SeriesItem } from "../../api/schemas";

export type SeriesSortKey = "added" | "name";

const STORAGE_KEY = "sv_sort_series";
const DEFAULT_SORT: SeriesSortKey = "added";

function isValidSort(value: string): value is SeriesSortKey {
  return value === "added" || value === "name";
}

export function getSortPref(): SeriesSortKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v !== null && isValidSort(v)) return v;
  } catch {
    // private browsing / restricted — fall through
  }
  return DEFAULT_SORT;
}

export function setSortPref(sort: SeriesSortKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, sort);
  } catch {
    // quota / restricted — swallow
  }
}

export function sortSeriesItems(
  items: readonly SeriesItem[],
  sort: SeriesSortKey,
): SeriesItem[] {
  const copy = items.slice();
  if (sort === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }
  // "added": newest-first. Items missing `added` sink to the bottom.
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
