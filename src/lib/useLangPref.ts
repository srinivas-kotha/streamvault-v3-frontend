/**
 * useLangPref — React hook wrapping the unified `sv_lang_pref` localStorage key.
 *
 * Replaces the `useState(() => getLangPref())` boilerplate that's duplicated
 * across LiveRoute / MoviesRoute / SeriesRoute. Reading through this hook
 * guarantees every route agrees on the current preference and reacts to
 * cross-tab updates via the browser's `storage` event.
 *
 * Usage:
 *   const [lang, setLang] = useLangPref();                    // Live (5 chips)
 *   const [lang, setLang] = useLangPref({ excludeSports: true }); // Movies/Series (4 chips)
 *
 * When `excludeSports` is true and the stored pref is "sports", the hook
 * maps it to "all" without overwriting storage — Live may still hold
 * "sports" as the persisted pref. Writing "sports" through an
 * excludeSports hook is a no-op (prevents Movies from poisoning the Live
 * preference).
 */
import { useCallback, useEffect, useState } from "react";
import { getLangPref, setLangPref, type LangId } from "./langPref";

const STORAGE_KEY = "sv_lang_pref";

export interface UseLangPrefOptions {
  /**
   * Map a stored "sports" pref to "all" on read, and refuse "sports" on write.
   * Use on any surface that doesn't have a Sports chip (Movies, Series, Search).
   */
  excludeSports?: boolean;
}

type SetLang = (lang: LangId) => void;

function resolve(raw: LangId, excludeSports: boolean): LangId {
  return excludeSports && raw === "sports" ? "all" : raw;
}

export function useLangPref(
  options: UseLangPrefOptions = {},
): [LangId, SetLang] {
  const { excludeSports = false } = options;

  const [value, setValue] = useState<LangId>(() =>
    resolve(getLangPref(), excludeSports),
  );

  const setLang = useCallback<SetLang>(
    (lang) => {
      if (excludeSports && lang === "sports") return;
      setLangPref(lang);
      setValue(resolve(lang, excludeSports));
    },
    [excludeSports],
  );

  // Cross-tab sync: when another tab changes sv_lang_pref, update locally.
  // This also catches Settings-driven changes from a sibling route.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setValue(resolve(getLangPref(), excludeSports));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [excludeSports]);

  return [value, setLang];
}
