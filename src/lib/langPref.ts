/**
 * langPref — unified language preference helper.
 *
 * Single localStorage key: sv_lang_pref
 * Default: "telugu"
 *
 * Migration: on first read, if the legacy key sv_live_lang exists and
 * sv_lang_pref does NOT, copy the value over and delete the legacy key.
 * This is a one-shot migration — subsequent reads skip the check.
 */

export type LangId = "telugu" | "hindi" | "english" | "sports" | "all";

const PREF_KEY = "sv_lang_pref";
const LEGACY_KEY = "sv_live_lang";
const DEFAULT_LANG: LangId = "telugu";

const VALID_LANGS: ReadonlySet<string> = new Set<LangId>([
  "telugu",
  "hindi",
  "english",
  "sports",
  "all",
]);

function isValidLang(value: string): value is LangId {
  return VALID_LANGS.has(value);
}

/**
 * Read the unified language preference from localStorage.
 * Performs one-shot migration from sv_live_lang on first call
 * when sv_lang_pref is absent.
 */
export function getLangPref(): LangId {
  try {
    // One-shot migration: if new key is absent but legacy exists, copy it.
    if (
      localStorage.getItem(PREF_KEY) === null &&
      localStorage.getItem(LEGACY_KEY) !== null
    ) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy !== null) {
        localStorage.setItem(PREF_KEY, legacy);
      }
      localStorage.removeItem(LEGACY_KEY);
    }

    const stored = localStorage.getItem(PREF_KEY);
    if (stored !== null && isValidLang(stored)) {
      return stored;
    }
  } catch {
    // localStorage may throw in private/restricted contexts — fall back silently.
  }
  return DEFAULT_LANG;
}

/**
 * Persist the language preference to localStorage.
 */
export function setLangPref(lang: LangId): void {
  try {
    localStorage.setItem(PREF_KEY, lang);
  } catch {
    // Silently ignore write failures (quota exceeded, private browsing, etc.)
  }
}
