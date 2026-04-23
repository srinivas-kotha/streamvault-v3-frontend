/**
 * sortFavorites — shared sort helper for /favorites.
 *
 * Two sort modes persisted via `sv_sort_favorites` localStorage key.
 */
import type { FavoriteItem } from "../../api/schemas";

export type FavoriteSortKey = "added" | "name";

const STORAGE_KEY = "sv_sort_favorites";
const DEFAULT_SORT: FavoriteSortKey = "added";

export function getFavoriteSortPref(): FavoriteSortKey {
  if (typeof window === "undefined") return DEFAULT_SORT;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "name" || v === "added" ? v : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export function setFavoriteSortPref(v: FavoriteSortKey): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // no-op
  }
}

export function sortFavorites(
  items: readonly FavoriteItem[],
  key: FavoriteSortKey,
): FavoriteItem[] {
  const arr = [...items];
  if (key === "name") {
    arr.sort((a, b) => {
      const an = (a.content_name ?? "").toLocaleLowerCase();
      const bn = (b.content_name ?? "").toLocaleLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  } else {
    // Recently added first
    arr.sort((a, b) => {
      const at = Date.parse(a.added_at) || 0;
      const bt = Date.parse(b.added_at) || 0;
      return bt - at;
    });
  }
  return arr;
}
