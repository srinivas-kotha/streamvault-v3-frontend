import { describe, it, expect } from "vitest";
import { categoryMatchesLang } from "./seriesLanguageUnion";
import type { SeriesCategory } from "../../api/schemas";

function cat(id: string, name: string): SeriesCategory {
  return { id, name, parentId: null, type: "series", count: 0 };
}

describe("seriesLanguageUnion.categoryMatchesLang", () => {
  it("matches Telugu by the literal word", () => {
    expect(categoryMatchesLang(cat("1", "Telugu Serials"), "telugu")).toBe(
      true,
    );
    expect(categoryMatchesLang(cat("2", "English Drama"), "telugu")).toBe(
      false,
    );
  });

  it("matches Hindi via broader patterns — Bollywood, Indian, India Entertainment", () => {
    expect(categoryMatchesLang(cat("1", "Bollywood Classics"), "hindi")).toBe(
      true,
    );
    expect(categoryMatchesLang(cat("2", "Indian Drama"), "hindi")).toBe(true);
    expect(
      categoryMatchesLang(cat("3", "India Entertainment HD"), "hindi"),
    ).toBe(true);
    expect(categoryMatchesLang(cat("4", "Hindi Serials"), "hindi")).toBe(true);
  });

  it("matches English by the literal word", () => {
    expect(categoryMatchesLang(cat("1", "English Drama"), "english")).toBe(true);
    expect(categoryMatchesLang(cat("2", "HBO Series"), "english")).toBe(true);
  });

  it("OTT platforms contribute under every language (items are filtered by name downstream)", () => {
    // 2026-04-23: Netflix / Hotstar / Zee5 / Sony LIV carry multi-language
    // content. They're matched as OTT categories so their items flow into
    // the union — the union then filters by series NAME per selected
    // language (see `streamSeriesLanguageUnion`).
    expect(categoryMatchesLang(cat("1", "Netflix Originals"), "telugu")).toBe(
      true,
    );
    expect(categoryMatchesLang(cat("2", "Disney+ Hotstar"), "hindi")).toBe(true);
    expect(categoryMatchesLang(cat("3", "Amazon Prime"), "english")).toBe(true);
  });

  it("returns true for 'all' regardless of name", () => {
    expect(categoryMatchesLang(cat("1", "Random Category"), "all")).toBe(true);
  });

  it("returns false for 'sports' (Series has no Sports chip)", () => {
    expect(categoryMatchesLang(cat("1", "Sports Live"), "sports")).toBe(false);
  });

  it("Telugu-exclusive categories beat ambiguous OTT matches", () => {
    // "Zee Telugu" contains the word "telugu" → pure-lang telugu match.
    expect(categoryMatchesLang(cat("1", "Zee Telugu"), "telugu")).toBe(true);
    expect(categoryMatchesLang(cat("2", "Zee Telugu"), "hindi")).toBe(false);
    // "Colors Hindi" has no telugu cue → does not leak into Telugu.
    expect(categoryMatchesLang(cat("3", "Colors Hindi"), "telugu")).toBe(false);
    expect(categoryMatchesLang(cat("4", "Colors Hindi"), "hindi")).toBe(true);
  });
});
