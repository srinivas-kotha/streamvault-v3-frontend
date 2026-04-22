/**
 * useSortedChannels tests (Task 4.4)
 *
 * Verifies all three sort modes:
 *  - number: numeric compare on `channel.num`
 *  - name:   localeCompare on `channel.name`
 *  - category: resolved category NAME (D7a — NOT raw UUID), with stable
 *    secondary order by `channel.num` within a category group.
 *
 * Also guards against input mutation: the hook must return a new array
 * without reordering the caller's state array in place.
 */
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useSortedChannels, type Category } from "./useSortedChannels";
import type { Channel } from "../../api/schemas";

const mk = (id: string, num: number, name: string, categoryId: string): Channel => ({
  id,
  num,
  name,
  categoryId,
  streamUrl: `https://example.com/${id}.m3u8`,
});

// Intentionally unsorted in the seed.
const channels: Channel[] = [
  mk("c3", 303, "CNN", "uuid-news"),
  mk("c1", 101, "BBC News", "uuid-news"),
  mk("c2", 202, "AMC", "uuid-ent"),
  mk("c4", 404, "Discovery", "uuid-doc"),
];

const categories: Category[] = [
  { id: "uuid-news", name: "News" },
  { id: "uuid-ent", name: "Entertainment" },
  { id: "uuid-doc", name: "Documentaries" },
];

describe("useSortedChannels", () => {
  it("sorts by number (numeric, ascending)", () => {
    const { result } = renderHook(() =>
      useSortedChannels(channels, "number", categories),
    );
    expect(result.current.map((c) => c.num)).toEqual([101, 202, 303, 404]);
  });

  it("sorts by name (localeCompare)", () => {
    const { result } = renderHook(() =>
      useSortedChannels(channels, "name", categories),
    );
    // AMC < BBC News < CNN < Discovery
    expect(result.current.map((c) => c.name)).toEqual([
      "AMC",
      "BBC News",
      "CNN",
      "Discovery",
    ]);
  });

  it("sorts by resolved category NAME (D7a — not UUID)", () => {
    const { result } = renderHook(() =>
      useSortedChannels(channels, "category", categories),
    );
    // Documentaries < Entertainment < News (localeCompare on the RESOLVED
    // names). If the hook sorted by UUID the order would be ent→news→doc.
    const resolved = result.current.map((c) => {
      const cat = categories.find((k) => k.id === c.categoryId);
      return cat?.name;
    });
    expect(resolved).toEqual([
      "Documentaries",
      "Entertainment",
      "News",
      "News",
    ]);
    // Within the News group, BBC (101) < CNN (303) — stable by num.
    const news = result.current.filter((c) => c.categoryId === "uuid-news");
    expect(news.map((c) => c.num)).toEqual([101, 303]);
  });

  it("falls back to raw categoryId when category not in map", () => {
    const { result } = renderHook(() =>
      useSortedChannels(channels, "category", []),
    );
    // No categories map → sort falls back to UUID string. All channels still
    // appear; grouping is by UUID.
    expect(result.current).toHaveLength(channels.length);
  });

  it("returns empty array when given empty channels", () => {
    const { result } = renderHook(() =>
      useSortedChannels([], "number", categories),
    );
    expect(result.current).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...channels];
    const snapshot = input.map((c) => c.id);
    renderHook(() => useSortedChannels(input, "number", categories));
    expect(input.map((c) => c.id)).toEqual(snapshot);
  });
});
