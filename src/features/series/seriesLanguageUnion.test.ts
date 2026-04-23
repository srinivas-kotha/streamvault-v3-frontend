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

  it("matches English via broader patterns — Netflix, HBO, Amazon", () => {
    expect(categoryMatchesLang(cat("1", "Netflix Originals"), "english")).toBe(
      true,
    );
    expect(categoryMatchesLang(cat("2", "HBO Series"), "english")).toBe(true);
    expect(categoryMatchesLang(cat("3", "Amazon Prime"), "english")).toBe(true);
  });

  it("returns true for 'all' regardless of name", () => {
    expect(categoryMatchesLang(cat("1", "Random Category"), "all")).toBe(true);
  });

  it("returns false for 'sports' (Series has no Sports chip)", () => {
    expect(categoryMatchesLang(cat("1", "Sports Live"), "sports")).toBe(false);
  });

  it("first-matching-language wins when patterns overlap", () => {
    expect(categoryMatchesLang(cat("1", "English Hindi Mix"), "hindi")).toBe(
      true,
    );
    expect(categoryMatchesLang(cat("2", "English Hindi Mix"), "english")).toBe(
      false,
    );
  });
});
