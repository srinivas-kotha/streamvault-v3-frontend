/**
 * useDebounce — 300ms debounce hook.
 *
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * of inactivity. No external dependencies required.
 */
import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
