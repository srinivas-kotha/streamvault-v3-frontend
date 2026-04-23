/**
 * Client-side language inference — mirrors
 * `streamvault-backend/src/services/language-inference.service.ts` exactly.
 *
 * Used only on surfaces where the backend does NOT already provide
 * `inferredLang` on the response payload — today that's `/api/search` hits,
 * which will be annotated by the LanguageRail post-query (see
 * `docs/ux/04-search-and-language-rail.md`).
 *
 * WARNING: keep the pattern set in lockstep with the backend service. If the
 * backend adds a pattern (e.g. "pongal" under telugu), add it here too. A
 * drift would cause a search result to surface under a language the list
 * endpoints would hide.
 */

import type { LangId } from "./langPref";

/** Languages we can infer. "all" / "null" are not outputs of this function. */
export type InferredLang = Exclude<LangId, "all">;

/**
 * Language → category-name substring patterns. Order matters: first match
 * wins (telugu before hindi before english before sports). Case-insensitive.
 *
 * SOURCE-OF-TRUTH for the shared base patterns:
 * `streamvault-backend/src/services/language-inference.service.ts`.
 *
 * The frontend extends that base with language-EXCLUSIVE TV channels only
 * (2026-04-23: user asked to "combine all zee telugu, aha, etc."). These
 * patterns must never be ambiguous between languages — a category that
 * could contain Telugu AND Hindi content (e.g. "Netflix", "Hotstar") must
 * NOT appear here. Multi-language platforms are handled separately via
 * `OTT_PLATFORM_PATTERNS` + `seriesNameMatchesLang`, which fetches their
 * items and filters by the series NAME instead of the category name.
 */
export const LANGUAGE_PATTERNS: Record<InferredLang, readonly string[]> = {
  telugu: [
    "telugu",
    "aha",
    "star maa",
    "etv",
    "gemini",
    "maa tv",
    "mahaa",
  ],
  hindi: [
    "hindi",
    "india entertainment",
    "indian",
    "bollywood",
    "colors tv",
    "colors hindi",
    "star plus",
    "star bharat",
    "zee tv",
    "sab tv",
    "and tv",
    "mtv hindi",
    "sun neo",
    "sony set",
    "bigg boss",
  ],
  english: ["english", "hbo", "apple tv", "usa ", "uk "],
  sports: [
    "sport",
    "sports",
    "football",
    "cricket",
    "tennis",
    "nba",
    "nfl",
    "mlb",
    "epl",
    "ipl",
    "rugby",
    "f1",
    "racing",
  ],
} as const;

/**
 * Multi-language OTT / streaming-service categories.
 *
 * These categories carry Telugu, Hindi, and English content side-by-side.
 * Routing the whole category to one language would mis-bucket the rest.
 * Callers fetch these categories unconditionally and filter by series NAME
 * via `seriesNameMatchesLang`.
 */
export const OTT_PLATFORM_PATTERNS: readonly string[] = [
  "hotstar",
  "disney+",
  "zee5",
  "sonyliv",
  "sony liv",
  "jiocinema",
  "jio cinema",
  "voot",
  "netflix",
  "amazon",
  "prime video",
  "alt balaji",
  "altbalaji",
];

export function isOttPlatform(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  return OTT_PLATFORM_PATTERNS.some((pat) => lower.includes(pat));
}

/**
 * Per-item language inference for OTT catalogues.
 *
 * When a Hotstar / Netflix / Zee5 category is fetched under the Telugu
 * filter, we include only items whose NAME hints at Telugu. Providers
 * conventionally tag these as "Title (Telugu)", "Title - Telugu", etc.
 *
 * Word-boundary matching is deliberate: a Hindi title with the English
 * word "telugu" accidentally embedded (rare but possible) is not a real
 * match. "All" accepts every item. Sports is never inferred from a
 * series/movie name — OTT catalogues are never sports.
 */
const NAME_LANG_WORDS: Record<Exclude<LangId, "all" | "sports">, RegExp> = {
  telugu: /\btelugu\b/i,
  hindi: /\bhindi\b/i,
  english: /\benglish\b/i,
};

export function seriesNameMatchesLang(name: string, lang: LangId): boolean {
  if (lang === "all") return true;
  if (lang === "sports") return false;
  return NAME_LANG_WORDS[lang].test(name);
}

/**
 * Aliases for matching HLS / native audio-track labels against a LangId.
 *
 * HLS manifests and MP4 `<audio>` tracks tag languages using inconsistent
 * codes: ISO 639-1 (`te`, `hi`, `en`), ISO 639-2 (`tel`, `hin`, `eng`), or
 * the full English name spelled out. We check all three. The UI never
 * auto-selects for `all` or `sports` — those aren't real audio languages.
 */
const AUDIO_LANG_ALIASES: Record<Exclude<LangId, "all" | "sports">, readonly string[]> = {
  telugu: ["telugu", "tel", "te"],
  hindi: ["hindi", "hin", "hi"],
  english: ["english", "eng", "en"],
};

/**
 * Score a track against a language pref. Higher is better. 0 = no match.
 *
 * Exact language-code match scores higher than a loose name-substring hit
 * so "te" beats an accidental "te" inside "Director Commentary". We check:
 *   3 — language code is an exact alias      (e.g. lang === "tel")
 *   2 — track name is exactly the full word  (e.g. name === "Telugu")
 *   1 — full-word appears inside the name    (word-boundary regex)
 */
export function scoreAudioTrackForLang(
  track: { lang: string; name: string },
  lang: LangId,
): number {
  if (lang === "all" || lang === "sports") return 0;
  const aliases = AUDIO_LANG_ALIASES[lang];
  const tLang = track.lang.trim().toLowerCase();
  const tName = track.name.trim().toLowerCase();
  if (tLang && aliases.includes(tLang)) return 3;
  if (tName && aliases.includes(tName)) return 2;
  const fullWord = aliases[0]!; // "telugu" | "hindi" | "english"
  const re = new RegExp(`\\b${fullWord}\\b`, "i");
  if (re.test(track.name)) return 1;
  return 0;
}

/**
 * Pick the best-matching audio track index for a language pref.
 * Returns -1 when no track is a meaningful match — callers should leave
 * the browser default selection alone in that case.
 */
export function pickAudioTrackForLang(
  tracks: readonly { index: number; lang: string; name: string }[],
  lang: LangId,
): number {
  if (tracks.length === 0) return -1;
  let bestIdx = -1;
  let bestScore = 0;
  for (const t of tracks) {
    const s = scoreAudioTrackForLang(t, lang);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = t.index;
    }
  }
  return bestIdx;
}

/**
 * Infer the language of a catalog item from its category name.
 * Returns the first matching language, or null when no pattern matches.
 */
export function inferLanguage(categoryName: string): InferredLang | null {
  const lower = categoryName.toLowerCase();
  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS) as Array<
    [InferredLang, readonly string[]]
  >) {
    if (patterns.some((pat) => lower.includes(pat))) {
      return lang;
    }
  }
  return null;
}
