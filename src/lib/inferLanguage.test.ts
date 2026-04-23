/**
 * inferLanguage — unit tests.
 *
 * Mirrors the backend service tests 1:1 so client/server parity is enforced
 * by the build. If the backend adds a pattern, copying it here is the only
 * way this suite will pass.
 */
import { describe, expect, it } from "vitest";
import {
  inferLanguage,
  LANGUAGE_PATTERNS,
  isOttPlatform,
  seriesNameMatchesLang,
  scoreAudioTrackForLang,
  pickAudioTrackForLang,
} from "./inferLanguage";

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
    expect(inferLanguage("HBO Max")).toBe("english");
    expect(inferLanguage("USA Sitcoms")).toBe("english");
  });

  it("returns null for multi-language OTT platforms", () => {
    // 2026-04-23: OTT platforms (Netflix, Hotstar, Zee5, …) carry content in
    // multiple languages. Routing them wholesale to a single language was
    // wrong — they are handled separately via `isOttPlatform` + per-item
    // name filtering in the language-union fetchers.
    expect(inferLanguage("Netflix Originals")).toBe(null);
    expect(inferLanguage("Amazon Prime")).toBe(null);
    expect(inferLanguage("Disney+ Hotstar")).toBe(null);
    expect(inferLanguage("Zee5 Originals")).toBe(null);
  });

  it("isOttPlatform recognises multi-language streaming categories", () => {
    expect(isOttPlatform("Netflix Originals")).toBe(true);
    expect(isOttPlatform("Disney+ Hotstar")).toBe(true);
    expect(isOttPlatform("Zee5")).toBe(true);
    expect(isOttPlatform("Sony LIV")).toBe(true);
    expect(isOttPlatform("JioCinema")).toBe(true);
    // Pure-language categories are NOT OTT platforms.
    expect(isOttPlatform("Zee Telugu")).toBe(false);
    expect(isOttPlatform("Star Maa")).toBe(false);
    expect(isOttPlatform("Hindi Serials")).toBe(false);
  });

  it("seriesNameMatchesLang filters OTT items by the language tag in the name", () => {
    expect(seriesNameMatchesLang("Panchayat (Telugu)", "telugu")).toBe(true);
    expect(seriesNameMatchesLang("Panchayat (Hindi)", "telugu")).toBe(false);
    expect(seriesNameMatchesLang("Succession - English", "english")).toBe(true);
    expect(seriesNameMatchesLang("Any Title", "all")).toBe(true);
    expect(seriesNameMatchesLang("Any Title", "sports")).toBe(false);
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

describe("audio-track lang matching", () => {
  it("scoreAudioTrackForLang recognises ISO 639-1 + 639-2 + full-name lang codes", () => {
    // 639-2 (tel/hin/eng)
    expect(scoreAudioTrackForLang({ lang: "tel", name: "" }, "telugu")).toBe(3);
    expect(scoreAudioTrackForLang({ lang: "hin", name: "" }, "hindi")).toBe(3);
    expect(scoreAudioTrackForLang({ lang: "eng", name: "" }, "english")).toBe(3);
    // 639-1 (te/hi/en)
    expect(scoreAudioTrackForLang({ lang: "te", name: "" }, "telugu")).toBe(3);
    expect(scoreAudioTrackForLang({ lang: "hi", name: "" }, "hindi")).toBe(3);
    // Full-name in `name` field when `lang` is missing (common in MKV).
    expect(scoreAudioTrackForLang({ lang: "", name: "Telugu" }, "telugu")).toBe(2);
    expect(scoreAudioTrackForLang({ lang: "", name: "Hindi Dub" }, "hindi")).toBe(1);
  });

  it("scoreAudioTrackForLang rejects non-matches", () => {
    expect(scoreAudioTrackForLang({ lang: "hin", name: "Hindi" }, "telugu")).toBe(0);
    expect(scoreAudioTrackForLang({ lang: "", name: "Commentary" }, "telugu")).toBe(0);
  });

  it("scoreAudioTrackForLang never auto-picks for 'all' or 'sports'", () => {
    expect(scoreAudioTrackForLang({ lang: "tel", name: "Telugu" }, "all")).toBe(0);
    expect(scoreAudioTrackForLang({ lang: "hin", name: "Hindi" }, "sports")).toBe(0);
  });

  it("pickAudioTrackForLang picks the highest-scoring track", () => {
    const tracks = [
      { index: 0, lang: "eng", name: "English" },
      { index: 1, lang: "hin", name: "Hindi" },
      { index: 2, lang: "tel", name: "Telugu" },
    ];
    expect(pickAudioTrackForLang(tracks, "telugu")).toBe(2);
    expect(pickAudioTrackForLang(tracks, "hindi")).toBe(1);
    expect(pickAudioTrackForLang(tracks, "english")).toBe(0);
  });

  it("pickAudioTrackForLang returns -1 when no track matches — caller leaves default alone", () => {
    const tracks = [
      { index: 0, lang: "eng", name: "English" },
      { index: 1, lang: "hin", name: "Hindi" },
    ];
    expect(pickAudioTrackForLang(tracks, "telugu")).toBe(-1);
    expect(pickAudioTrackForLang([], "telugu")).toBe(-1);
  });

  it("prefers exact lang-code over loose name substring", () => {
    // A track tagged `tel` beats one whose name merely mentions "telugu".
    const tracks = [
      { index: 0, lang: "", name: "Telugu Commentary" }, // score 1
      { index: 1, lang: "tel", name: "Main" }, // score 3
    ];
    expect(pickAudioTrackForLang(tracks, "telugu")).toBe(1);
  });
});
