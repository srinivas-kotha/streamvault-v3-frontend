import { useEffect, useState } from "react";
import { getFlag, refreshFlags, type FlagValue } from "./featureFlags";

/**
 * Read a feature flag. Returns `{ value, loading }`:
 *   - loading=true on first render before any cache exists
 *   - loading=false once a value is available (fresh or stale)
 *
 * Components that gate behavior on a flag should ALWAYS check loading
 * first; rendering the new behavior while loading would cause flicker
 * if the cached value flipped.
 */
export function useFeatureFlag<T extends FlagValue>(
  key: string,
  defaultValue: T,
): { value: T; loading: boolean } {
  const initial = getFlag<T>(key, defaultValue);
  const [value, setValue] = useState<T>(initial);
  const [loading, setLoading] = useState<boolean>(initial === defaultValue);

  useEffect(() => {
    let cancelled = false;
    void refreshFlags().then((flags) => {
      if (cancelled) return;
      const v = key in flags ? (flags[key] as T) : defaultValue;
      setValue(v);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key, defaultValue]);

  return { value, loading };
}
