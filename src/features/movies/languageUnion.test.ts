import { describe, it, expect, beforeEach, vi } from "vitest";
import type { VodCategory, VodStream } from "../../api/schemas";

const fetchVodCategoriesMock = vi.hoisted(() => vi.fn());
const fetchVodStreamsMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/vod", () => ({
  fetchVodCategories: fetchVodCategoriesMock,
  fetchVodStreams: fetchVodStreamsMock,
}));

import {
  fetchLanguageUnion,
  invalidateLanguageUnionCache,
  categoryMatchesLang,
} from "./languageUnion";

function cat(id: string, name: string): VodCategory {
  return { id, name, parentId: null, type: "vod" };
}

function stream(id: string, categoryId: string): VodStream {
  return { id, name: `Movie ${id}`, type: "vod", categoryId };
}

describe("categoryMatchesLang", () => {
  it("matches telugu categories by substring", () => {
    expect(categoryMatchesLang(cat("1", "Telugu Action"), "telugu")).toBe(true);
    expect(categoryMatchesLang(cat("2", "Hindi Movies"), "telugu")).toBe(false);
  });

  it("lets every category through when lang === 'all'", () => {
    expect(categoryMatchesLang(cat("1", "Random Stuff"), "all")).toBe(true);
  });

  it("never matches when lang === 'sports' (Movies has no Sports chip)", () => {
    expect(categoryMatchesLang(cat("1", "Sports Live"), "sports")).toBe(false);
  });
});

describe("fetchLanguageUnion", () => {
  beforeEach(() => {
    invalidateLanguageUnionCache();
    fetchVodCategoriesMock.mockReset();
    fetchVodStreamsMock.mockReset();
  });

  it("fetches streams for every matching category in parallel and dedupes by id", async () => {
    fetchVodCategoriesMock.mockResolvedValue([
      cat("1", "Telugu Action"),
      cat("2", "Telugu Drama"),
      cat("3", "Hindi Action"),
    ]);
    fetchVodStreamsMock.mockImplementation((id: string) => {
      if (id === "1") return Promise.resolve([stream("a", "1"), stream("b", "1")]);
      if (id === "2") return Promise.resolve([stream("b", "2"), stream("c", "2")]);
      return Promise.resolve([stream("d", "3")]);
    });

    const result = await fetchLanguageUnion("telugu");

    expect(result.matchedCategories).toBe(2);
    expect(result.streams.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(fetchVodStreamsMock).toHaveBeenCalledTimes(2);
    expect(fetchVodStreamsMock).toHaveBeenCalledWith("1");
    expect(fetchVodStreamsMock).toHaveBeenCalledWith("2");
  });

  it("tolerates a failing category — other categories still contribute", async () => {
    fetchVodCategoriesMock.mockResolvedValue([
      cat("1", "Telugu A"),
      cat("2", "Telugu B"),
    ]);
    fetchVodStreamsMock.mockImplementation((id: string) => {
      if (id === "1") return Promise.reject(new Error("boom"));
      return Promise.resolve([stream("x", "2")]);
    });

    const result = await fetchLanguageUnion("telugu");
    expect(result.streams.map((s) => s.id)).toEqual(["x"]);
  });

  it("reuses cached categories on the second call within TTL", async () => {
    fetchVodCategoriesMock.mockResolvedValue([cat("1", "Telugu A")]);
    fetchVodStreamsMock.mockResolvedValue([stream("x", "1")]);

    await fetchLanguageUnion("telugu");
    await fetchLanguageUnion("telugu");

    expect(fetchVodCategoriesMock).toHaveBeenCalledTimes(1);
  });

  it("returns empty union when lang is 'sports' (Movies chip excludes sports)", async () => {
    fetchVodCategoriesMock.mockResolvedValue([
      cat("1", "Sports Live"),
      cat("2", "Cricket Live"),
    ]);

    const result = await fetchLanguageUnion("sports");
    expect(result.streams).toEqual([]);
    expect(result.matchedCategories).toBe(0);
    expect(fetchVodStreamsMock).not.toHaveBeenCalled();
  });

  it("returns the full catalog when lang is 'all'", async () => {
    fetchVodCategoriesMock.mockResolvedValue([
      cat("1", "Whatever"),
      cat("2", "Another"),
    ]);
    fetchVodStreamsMock.mockImplementation((id: string) =>
      Promise.resolve([stream(`x${id}`, id)]),
    );

    const result = await fetchLanguageUnion("all");
    expect(result.matchedCategories).toBe(2);
    expect(result.streams.map((s) => s.id).sort()).toEqual(["x1", "x2"]);
  });
});
