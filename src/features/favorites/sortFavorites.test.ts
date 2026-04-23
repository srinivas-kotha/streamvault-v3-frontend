import { describe, it, expect, beforeEach } from "vitest";
import {
  sortFavorites,
  getFavoriteSortPref,
  setFavoriteSortPref,
} from "./sortFavorites";
import type { FavoriteItem } from "../../api/schemas";

function mk(
  id: number,
  name: string,
  added_at: string,
): FavoriteItem {
  return {
    id,
    content_type: "vod",
    content_id: id,
    content_name: name,
    content_icon: null,
    category_name: null,
    sort_order: id,
    added_at,
  };
}

describe("sortFavorites", () => {
  const items: FavoriteItem[] = [
    mk(1, "Charlie", "2026-01-03T00:00:00Z"),
    mk(2, "alice", "2026-01-01T00:00:00Z"),
    mk(3, "Bob", "2026-01-02T00:00:00Z"),
  ];

  it("sorts by recently added (newest first) by default", () => {
    const sorted = sortFavorites(items, "added");
    expect(sorted.map((i) => i.content_id)).toEqual([1, 3, 2]);
  });

  it("sorts alphabetically case-insensitive by name", () => {
    const sorted = sortFavorites(items, "name");
    expect(sorted.map((i) => i.content_name)).toEqual(["alice", "Bob", "Charlie"]);
  });

  it("does not mutate input", () => {
    const original = [...items];
    sortFavorites(items, "name");
    expect(items).toEqual(original);
  });
});

describe("favoriteSortPref storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("default is 'added' when unset", () => {
    expect(getFavoriteSortPref()).toBe("added");
  });

  it("round-trips values", () => {
    setFavoriteSortPref("name");
    expect(getFavoriteSortPref()).toBe("name");
    setFavoriteSortPref("added");
    expect(getFavoriteSortPref()).toBe("added");
  });

  it("returns default on garbage value", () => {
    window.localStorage.setItem("sv_sort_favorites", "garbage");
    expect(getFavoriteSortPref()).toBe("added");
  });
});
