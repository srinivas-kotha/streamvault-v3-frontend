import { describe, it, expect, beforeEach } from "vitest";
import {
  getSortPref,
  setSortPref,
  sortSeriesItems,
} from "./sortSeries";
import type { SeriesItem } from "../../api/schemas";

function item(
  id: string,
  name: string,
  added?: string | null,
): SeriesItem {
  return {
    id,
    name,
    categoryId: "cat1",
    icon: null,
    isAdult: false,
    added: added ?? null,
  };
}

describe("sortSeries", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to 'added' when no preference stored", () => {
    expect(getSortPref()).toBe("added");
  });

  it("round-trips through localStorage", () => {
    setSortPref("name");
    expect(getSortPref()).toBe("name");
    setSortPref("added");
    expect(getSortPref()).toBe("added");
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("sv_sort_series", "nonsense");
    expect(getSortPref()).toBe("added");
  });

  it("sortSeriesItems 'added' puts newest first, items without 'added' sink", () => {
    const items = [
      item("1", "Old", "2020-01-01T00:00:00Z"),
      item("2", "New", "2026-01-01T00:00:00Z"),
      item("3", "Missing", null),
    ];
    const out = sortSeriesItems(items, "added");
    expect(out.map((x) => x.id)).toEqual(["2", "1", "3"]);
  });

  it("sortSeriesItems 'name' sorts alphabetically", () => {
    const items = [
      item("1", "Zebra"),
      item("2", "Alpha"),
      item("3", "Monkey"),
    ];
    const out = sortSeriesItems(items, "name");
    expect(out.map((x) => x.name)).toEqual(["Alpha", "Monkey", "Zebra"]);
  });

  it("sortSeriesItems does not mutate input", () => {
    const items = [item("1", "B"), item("2", "A")];
    const snapshot = items.map((i) => i.id);
    sortSeriesItems(items, "name");
    expect(items.map((i) => i.id)).toEqual(snapshot);
  });
});
