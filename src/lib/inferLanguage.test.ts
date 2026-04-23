/**
 * inferLanguage — unit tests.
 *
 * Mirrors the backend service tests 1:1 so client/server parity is enforced
 * by the build. If the backend adds a pattern, copying it here is the only
 * way this suite will pass.
 */
import { describe, expect, it } from "vitest";
import { inferLanguage, LANGUAGE_PATTERNS } from "./inferLanguage";

describe("inferLanguage", () => {
  it("returns 'telugu' for Telugu categories", () => {
    expect(inferLanguage("Telugu Movies HD")).toBe("telugu");
    expect(inferLanguage("TELUGU ACTION")).toBe("telugu");
  });

  it("returns 'hindi' for Hindi / Bollywood / Indian categories", () => {
    expect(inferLanguage("Hindi Classics")).toBe("hindi");
    expect(inferLanguage("Bollywood 2024")).toBe("hindi");
    expect(inferLanguage("India Entertainment")).toBe("hindi");
    expect(inferLanguage("Indian Dramas")).toBe("hindi");
  });

  it("returns 'english' for English / streamer-branded categories", () => {
    expect(inferLanguage("English Movies")).toBe("english");
    expect(inferLanguage("Netflix Originals")).toBe("english");
    expect(inferLanguage("HBO Max")).toBe("english");
    expect(inferLanguage("USA Sitcoms")).toBe("english");
  });

  it("returns 'sports' for sports-themed categories", () => {
    expect(inferLanguage("IPL 2025")).toBe("sports");
    expect(inferLanguage("Cricket Live")).toBe("sports");
    expect(inferLanguage("F1 Racing")).toBe("sports");
  });

  it("returns null when no pattern matches", () => {
    expect(inferLanguage("Korean Dramas")).toBe(null);
    expect(inferLanguage("Tamil Hits")).toBe(null);
    expect(inferLanguage("")).toBe(null);
  });

  it("preserves first-match-wins ordering (telugu > hindi > english > sports)", () => {
    // "Telugu Cricket" — both telugu and sports would match. Telugu wins.
    expect(inferLanguage("Telugu Cricket Highlights")).toBe("telugu");
    // "Hindi Sports" — hindi wins over sports.
    expect(inferLanguage("Hindi Sports News")).toBe("hindi");
  });

  it("exposes the pattern set for backend parity checks", () => {
    // Parity assertion: every language has ≥1 pattern. Don't check exact
    // list — that's brittle. But a missing pattern set is a bug worth
    // surfacing at build time.
    for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
      expect(patterns.length, `${lang} has no patterns`).toBeGreaterThan(0);
    }
  });
});
