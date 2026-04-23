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
 * SOURCE-OF-TRUTH: `streamvault-backend/src/services/language-inference.service.ts`.
 */
export const LANGUAGE_PATTERNS: Record<InferredLang, readonly string[]> = {
  telugu: ["telugu"],
  hindi: ["hindi", "india entertainment", "indian", "bollywood"],
  english: ["english", "netflix", "amazon", "hbo", "usa ", "uk "],
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
