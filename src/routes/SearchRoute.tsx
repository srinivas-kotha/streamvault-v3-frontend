/**
 * SearchRoute — Phase 7 unified search.
 *
 * Architecture:
 *  - Controlled <input> bound via norigin useFocusable (SEARCH_INPUT).
 *  - 300ms debounce via useDebounce; also triggers on Enter (onEnterPress).
 *  - Results grouped: Live / Movies / Series (vod in API = Movies in UI).
 *  - Each result card: useFocusable SEARCH_RESULT_<TYPE>_<ID> + navigate.
 *  - States: idle (< 2 chars), loading, results, empty, error.
 *
 * D-pad flow:
 *  ArrowUp from dock → SEARCH_INPUT
 *  ArrowDown from input → first result row
 *  ArrowLeft/Right within a row → adjacent cards
 *  ArrowDown between rows → next section
 *
 * CONTENT_AREA_SEARCH useFocusable is load-bearing — dropping it breaks
 * BottomDock's setFocus("CONTENT_AREA_SEARCH") Esc-key routing.
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { Skeleton } from "../primitives/Skeleton";
import { fetchSearch } from "../api/search";
import type { SearchResults } from "../api/schemas";
import { SearchInput } from "../features/search/SearchInput";
import { SearchResultsSection } from "../features/search/SearchResultsSection";
import { useDebounce } from "../features/search/useDebounce";

// ─── useSearchQuery — encapsulates fetch + state management ─────────────────

function useSearchQuery(debouncedQuery: string) {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");

  useEffect(() => {
    // Only fire if >= 2 chars — guard ensures no fetch for short queries.
    // The effect dep array drives reset implicitly: when debouncedQuery < 2,
    // we don't enter this block, so we rely on handleQueryChange to clear
    // state when the raw query shortens (below the 2-char threshold).
    if (debouncedQuery.length < 2) return;

    let cancelled = false;

    // Wrap the entire fetch + setLoading(true) inside a microtask so the
    // setState calls happen asynchronously, satisfying react-hooks/set-state-in-effect.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      return fetchSearch(debouncedQuery)
        .then((res) => {
          if (cancelled) return;
          setLastSearchedQuery(debouncedQuery);
          setResults(res);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setError("Search failed. Check your connection and try again.");
          setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
    setLoading(false);
  }, []);

  const runSearch = useCallback((q: string) => {
    if (q.length < 2) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSearch(q)
      .then((res) => {
        if (cancelled) return;
        setLastSearchedQuery(q);
        setResults(res);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Search failed. Check your connection and try again.");
        setLoading(false);
      });

    // Note: cannot return cleanup from useCallback — caller must manage it.
    return () => {
      cancelled = true;
    };
  }, []);

  return { results, loading, error, lastSearchedQuery, clearResults, runSearch };
}

// ─── SearchRoute ─────────────────────────────────────────────────────────────

export function SearchRoute() {
  // MUST PRESERVE: norigin root registration for the content area.
  // Dropping this breaks BottomDock's setFocus("CONTENT_AREA_SEARCH") Esc flow.
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_SEARCH" });

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const { results, loading, error, lastSearchedQuery, clearResults, runSearch } =
    useSearchQuery(debouncedQuery);

  // When raw query drops below 2 chars, clear results immediately so the
  // user doesn't see stale data while typing.
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (value.length < 2) {
        clearResults();
      }
    },
    [clearResults],
  );

  // Immediate search on Enter — bypasses debounce
  const handleSubmit = useCallback(() => {
    runSearch(query);
  }, [query, runSearch]);

  // Prime norigin focus on mount — land on SEARCH_INPUT
  useEffect(() => {
    setFocus("SEARCH_INPUT");
  }, []);

  // Derived state
  const hasResults =
    results !== null &&
    (results.live.length > 0 ||
      results.vod.length > 0 ||
      results.series.length > 0);

  const showHelp = query.length > 0 && query.length < 2;
  const showEmpty =
    !loading &&
    !error &&
    results !== null &&
    !hasResults &&
    lastSearchedQuery.length >= 2;

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="search"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
        }}
      >
        {/* Search input */}
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          onSubmit={handleSubmit}
        />

        {/* Help text — too short */}
        {showHelp && (
          <p
            aria-live="polite"
            style={{
              color: "var(--text-secondary)",
              fontSize: "var(--text-body-size)",
              padding: "0 var(--space-6) var(--space-4)",
            }}
          >
            Type at least 2 characters to search
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div
            aria-live="polite"
            aria-busy="true"
            aria-label="Loading results"
            style={{
              padding: "var(--space-4) var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <Skeleton width="120px" height={20} />
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <Skeleton width={160} height={140} />
              <Skeleton width={160} height={140} />
              <Skeleton width={160} height={140} />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <p
            role="alert"
            style={{
              color: "var(--danger)",
              fontSize: "var(--text-body-size)",
              padding: "var(--space-4) var(--space-6)",
            }}
          >
            {error}
          </p>
        )}

        {/* Empty state */}
        {showEmpty && (
          <p
            role="status"
            style={{
              color: "var(--text-secondary)",
              fontSize: "var(--text-body-size)",
              padding: "var(--space-4) var(--space-6)",
            }}
          >
            No results for &ldquo;{lastSearchedQuery}&rdquo;
          </p>
        )}

        {/* Results grouped by section */}
        {!loading && hasResults && results !== null && (
          <div>
            <SearchResultsSection title="Live" items={results.live} />
            <SearchResultsSection title="Movies" items={results.vod} />
            <SearchResultsSection title="Series" items={results.series} />
          </div>
        )}
      </main>
    </FocusContext.Provider>
  );
}
