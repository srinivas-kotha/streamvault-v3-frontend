/**
 * SearchRoute — cross-library FTS across Live / Movies / Series.
 *
 * Relationship to in-route Find:
 *   The FIND chip on /movies and /series is a client-side substring filter
 *   over the already-loaded grid, scoped to the current library + current
 *   language. This dock Search is the cross-library escalation — Postgres
 *   full-text search, stemmed, ranked, all languages, returns three buckets.
 *   Movies/Series empty states link here via /search?q=<findQuery>, which
 *   this route preseeds from the URL param.
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
import type { CatalogItem, SearchResults } from "../api/schemas";
import { SearchInput } from "../features/search/SearchInput";
import { SearchResultsSection } from "../features/search/SearchResultsSection";
import { SearchKindChips, type SearchKind } from "../features/search/SearchKindChips";
import { useDebounce } from "../features/search/useDebounce";
import { consumeOriginator } from "../nav/backStack";
import { LanguageRail } from "../components/LanguageRail";
import { useLangPref } from "../lib/useLangPref";
import type { LangId } from "../lib/langPref";
import { logEvent } from "../telemetry";

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
  const [lang, setLang] = useLangPref({ excludeSports: true });
  const debouncedQuery = useDebounce(query, 250);

  const { results, loading, error, lastSearchedQuery, clearResults, runSearch } =
    useSearchQuery(debouncedQuery);

  // Apply the current language filter to each bucket. When `lang === "all"`,
  // no filtering — return the raw results. When a specific language is
  // active, include only items whose server-annotated `inferredLang` matches.
  // Items with `inferredLang === null/undefined` (e.g. multi-language OTT
  // categories) are excluded from any specific language and surface only
  // under "All" — same safe-degradation behavior as Live/Movies/Series.
  const filteredResults = useMemo<SearchResults | null>(() => {
    if (results === null) return null;
    if (lang === "all") return results;
    const filterByLang = (items: CatalogItem[]): CatalogItem[] =>
      items.filter((it) => it.inferredLang === lang);
    return {
      live: filterByLang(results.live),
      vod: filterByLang(results.vod),
      series: filterByLang(results.series),
    };
  }, [results, lang]);

  const totalRawHits =
    results === null
      ? 0
      : results.live.length + results.vod.length + results.series.length;
  const totalFilteredHits =
    filteredResults === null
      ? 0
      : filteredResults.live.length +
        filteredResults.vod.length +
        filteredResults.series.length;

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

  const handleLangChange = useCallback(
    (next: LangId) => {
      setLang(next);
      logEvent("search_lang_filter_change", {
        lang: next,
        query: lastSearchedQuery,
        total_hits: totalRawHits,
      });
    },
    [setLang, lastSearchedQuery, totalRawHits],
  );

  // Fire `search_results_lang_zero` exactly when the active filter has
  // hidden every hit. Guarded so it only fires on transition into zero,
  // not on every render of the same zero state.
  useEffect(() => {
    if (
      lang !== "all" &&
      results !== null &&
      totalRawHits > 0 &&
      totalFilteredHits === 0
    ) {
      logEvent("search_results_lang_zero", {
        lang,
        query: lastSearchedQuery,
        total_hits: totalRawHits,
      });
    }
  }, [lang, results, totalRawHits, totalFilteredHits, lastSearchedQuery]);

  useEffect(() => {
    // If the user is returning from a detail route they opened from a
    // search-result card, restore focus there instead of the input.
    // consumeOriginator is read-once — on a fresh mount with no stored
    // key, fall back to the input seed.
    const saved = consumeOriginator("/search");
    if (saved) {
      logEvent("nav_originator_restored", {
        route: "/search",
        focus_key: saved,
      });
      setFocus(saved);
      return;
    }
    setFocus("SEARCH_INPUT");
  }, []);

  const hasResults = results !== null && totalRawHits > 0;
  const hasFilteredResults = filteredResults !== null && totalFilteredHits > 0;

  const showHelp = query.length > 0 && query.length < 2;
  const showEmpty =
    !loading &&
    !error &&
    results !== null &&
    !hasResults &&
    lastSearchedQuery.length >= 2;

  const showLangZeroEmpty =
    !loading &&
    !error &&
    hasResults &&
    !hasFilteredResults &&
    lang !== "all";

  const showMovies = kind === "all" || kind === "vod";
  const showSeries = kind === "all" || kind === "series";
  const showLive = kind === "all" || kind === "live";

  const handleShowAllLanguages = useCallback(() => {
    handleLangChange("all");
  }, [handleLangChange]);

  const langLabel =
    lang === "telugu"
      ? "Telugu"
      : lang === "hindi"
        ? "Hindi"
        : lang === "english"
          ? "English"
          : lang === "sports"
            ? "Sports"
            : "";

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="search"
        tabIndex={-1}
        style={{
          paddingBottom:
            "var(--dock-content-reserve, calc(var(--dock-height) + var(--space-6) + var(--space-6)))",
        }}
      >
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          onSubmit={handleSubmit}
        />

        {showHelp && (
          <div
            aria-live="polite"
            style={{
              padding: "0 var(--space-6) var(--space-4)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-body-size)",
            }}
          >
            <p style={{ margin: 0 }}>
              Find across Live, Movies &amp; Series — all languages.
            </p>
            <p
              style={{
                margin: "var(--space-1) 0 0",
                fontSize: "var(--text-caption-size)",
                color: "var(--text-tertiary)",
              }}
            >
              Type at least 2 characters. For filtering inside a single
              library, use FIND on Movies or Series instead.
            </p>
          </div>
        )}

        {hasResults && !loading && !error && (
          <LanguageRail value={lang} onChange={handleLangChange} />
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

        {showLangZeroEmpty && (
          <p
            role="status"
            style={{
              color: "var(--text-secondary)",
              fontSize: "var(--text-body-size)",
              padding: "var(--space-4) var(--space-6)",
            }}
          >
            No {langLabel} results for &ldquo;{lastSearchedQuery}&rdquo;.{" "}
            <button
              type="button"
              onClick={handleShowAllLanguages}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-copper)",
                cursor: "pointer",
                font: "inherit",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Show all {totalRawHits} result{totalRawHits === 1 ? "" : "s"}
            </button>
            .
          </p>
        )}

        {!loading && hasFilteredResults && filteredResults !== null && (
          <div>
            {showMovies && (
              <SearchResultsSection title="Movies" items={filteredResults.vod} />
            )}
            {showSeries && (
              <SearchResultsSection title="Series" items={filteredResults.series} />
            )}
            {showLive && (
              <SearchResultsSection title="Live" items={filteredResults.live} />
            )}
          </div>
        )}
      </main>
    </FocusContext.Provider>
  );
}
