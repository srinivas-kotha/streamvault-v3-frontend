/**
 * SearchRoute — unified search across Live / Movies / Series.
 *
 * Updated 2026-04-24 (search-favorites session):
 *   - Section order Movies → Series → Live (04 spec §3.4)
 *   - Debounce 300ms → 250ms (04 spec §1.3)
 *   - Kind chips (All · Live · Movies · Series) post-query only
 *   - Kind chip filters are client-side; does NOT re-fetch
 *   - Each result card has an OverflowMenu (Play / Add to favorites / More info)
 *
 * D-pad flow (unchanged except for kind chips step):
 *   Dock → SEARCH_INPUT
 *   Input Down → SEARCH_KIND_ALL (when results exist) → first section's first card
 *   Card Right → SEARCH_OVERFLOW_<TYPE>_<ID>
 *
 * CONTENT_AREA_SEARCH useFocusable is load-bearing — dropping it breaks
 * BottomDock's setFocus("CONTENT_AREA_SEARCH") Esc-key routing.
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SearchKindChips, type SearchKind } from "../features/search/SearchKindChips";
import { useDebounce } from "../features/search/useDebounce";

// ─── useSearchQuery — encapsulates fetch + state management ─────────────────

function useSearchQuery(debouncedQuery: string) {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");

  useEffect(() => {
    if (debouncedQuery.length < 2) return;

    let cancelled = false;

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

    return () => {
      cancelled = true;
    };
  }, []);

  return { results, loading, error, lastSearchedQuery, clearResults, runSearch };
}

// ─── SearchRoute ─────────────────────────────────────────────────────────────

export function SearchRoute() {
  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_SEARCH",
    focusable: false,
    trackChildren: true,
    isFocusBoundary: true,
    focusBoundaryDirections: ["left", "right", "up"],
  });

  // Preseed the query from ?q=… — used by /movies + /series "Search
  // everywhere" CTA when an in-route filter has zero matches.
  const initialQuery = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("q") ?? "";
    } catch {
      return "";
    }
  }, []);

  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<SearchKind>("all");
  const debouncedQuery = useDebounce(query, 250);

  const { results, loading, error, lastSearchedQuery, clearResults, runSearch } =
    useSearchQuery(debouncedQuery);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (value.length < 2) {
        clearResults();
      }
    },
    [clearResults],
  );

  const handleSubmit = useCallback(() => {
    runSearch(query);
  }, [query, runSearch]);

  useEffect(() => {
    setFocus("SEARCH_INPUT");
  }, []);

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

  const showMovies = kind === "all" || kind === "vod";
  const showSeries = kind === "all" || kind === "series";
  const showLive = kind === "all" || kind === "live";

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
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          onSubmit={handleSubmit}
        />

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

        {hasResults && !loading && !error && (
          <SearchKindChips value={kind} onChange={setKind} />
        )}

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

        {!loading && hasResults && results !== null && (
          <div>
            {showMovies && (
              <SearchResultsSection title="Movies" items={results.vod} />
            )}
            {showSeries && (
              <SearchResultsSection title="Series" items={results.series} />
            )}
            {showLive && (
              <SearchResultsSection title="Live" items={results.live} />
            )}
          </div>
        )}
      </main>
    </FocusContext.Provider>
  );
}
