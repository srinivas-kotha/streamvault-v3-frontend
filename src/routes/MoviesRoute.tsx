/**
 * MoviesRoute — Phase 2 rebuild.
 *
 * Spec: docs/ux/03-movies.md; plan: docs/ux/IMPLEMENTATION-PLAN.md Phase 2.
 *
 * Layout:
 *   Title "MOVIES"
 *   LanguageRail (4 chips — no Sports)  ← optional Continue-watching chip leftmost
 *   Toolbar: sort segmented control + count (sticky)
 *   MovieGrid (VirtuosoGrid) / EmptyStateWithLanguageSwitch
 *   MovieDetailSheet overlay (opens via ⋯ → More info)
 *
 * Category fetch strategy: we no longer show a CategoryStrip. Instead we
 * union all categories matching the current language pref (03-movies.md §3 —
 * "client-side language union"). Each language swap re-runs the union and
 * focus seeds to row 0 col 0. Sort flips re-order in place and never pull
 * focus.
 *
 * MUST PRESERVE: CONTENT_AREA_MOVIES focus key + FocusContext — load-bearing
 * for BottomDock's setFocus("CONTENT_AREA_MOVIES") on ArrowUp (Task 2.4).
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { MovieGrid } from "../features/movies/MovieGrid";
import { MovieDetailSheet } from "../features/movies/MovieDetailSheet";
import {
  fetchLanguageUnion,
  invalidateLanguageUnionCache,
} from "../features/movies/languageUnion";
import {
  getSortPref,
  setSortPref,
  sortStreams,
  type MovieSortKey,
} from "../features/movies/sortMovies";
import { isTierLocked } from "../features/movies/tierLockCache";
import { LanguageRail } from "../components/LanguageRail";
import { ErrorShell } from "../primitives/ErrorShell";
import { Skeleton } from "../primitives/Skeleton";
import { EmptyStateWithLanguageSwitch } from "../primitives/EmptyStateWithLanguageSwitch";
import { useLangPref } from "../lib/useLangPref";
import { fetchHistory } from "../api/history";
import { usePlayerOpener } from "../player/usePlayerOpener";
import type { HistoryItem, VodStream } from "../api/schemas";
import type { LangId } from "../lib/langPref";
import type { MovieCardProgress } from "../features/movies/MovieCard";

/** A progress ratio ≥ this counts the item as "watched" (dimmed + ✓ badge). */
const WATCHED_THRESHOLD = 0.9;

interface SortButtonProps {
  id: MovieSortKey;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}

function SortButton({ id, label, isActive, onSelect }: SortButtonProps) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: `MOVIES_SORT_${id.toUpperCase()}`,
    onEnterPress: onSelect,
  });
  const active = isActive || focused;
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-pressed={isActive}
      onClick={onSelect}
      className="focus-ring"
      style={{
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: active ? "var(--accent-copper)" : "var(--bg-surface)",
        color: active ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-tracking)",
        textTransform: "uppercase",
        cursor: "pointer",
        transition:
          "background var(--motion-focus), color var(--motion-focus)",
      }}
    >
      {label}
    </button>
  );
}

const SORT_OPTIONS: { id: MovieSortKey; label: string }[] = [
  { id: "added", label: "Added" },
  { id: "name", label: "Name" },
];

export function MoviesRoute() {
  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_MOVIES",
    focusable: false,
    trackChildren: true,
  });

  const { openPlayer } = usePlayerOpener();
  const [lang, setLang] = useLangPref({ excludeSports: true });
  const [sort, setSort] = useState<MovieSortKey>(() => getSortPref());
  const [streams, setStreams] = useState<VodStream[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sheetStream, setSheetStream] = useState<VodStream | null>(null);

  // ─── Language union fetch ─────────────────────────────────────────────────
  // Re-fetches on every language change. Errors render as error state;
  // loading on initial mount only shows the skeleton (subsequent switches
  // keep the grid mounted so focus doesn't flicker).
  const [fetchGeneration, setFetchGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchLanguageUnion(lang)
      .then(({ streams: fetched }) => {
        if (cancelled) return;
        setStreams(fetched);
        setLoading(false);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lang, fetchGeneration]);

  // ─── History fetch (non-blocking) ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchHistory()
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch(() => {
        // history is optional — silence on failure
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Derived: sorted streams + history lookup map ────────────────────────
  const sortedStreams = useMemo(() => sortStreams(streams, sort), [streams, sort]);

  const historyByVodId = useMemo(() => {
    const map = new Map<string, HistoryItem>();
    for (const h of history) {
      if (h.content_type === "vod") {
        map.set(String(h.content_id), h);
      }
    }
    return map;
  }, [history]);

  const getProgress = useCallback(
    (stream: VodStream): MovieCardProgress | undefined => {
      const h = historyByVodId.get(stream.id);
      if (!h || h.duration_seconds <= 0) return undefined;
      const ratio = h.progress_seconds / h.duration_seconds;
      if (ratio >= WATCHED_THRESHOLD) return undefined;
      if (h.progress_seconds <= 0) return undefined;
      return {
        progressSeconds: h.progress_seconds,
        durationSeconds: h.duration_seconds,
      };
    },
    [historyByVodId],
  );

  const isWatched = useCallback(
    (stream: VodStream): boolean => {
      const h = historyByVodId.get(stream.id);
      if (!h || h.duration_seconds <= 0) return false;
      return h.progress_seconds / h.duration_seconds >= WATCHED_THRESHOLD;
    },
    [historyByVodId],
  );

  const isTierLockedFn = useCallback(
    (stream: VodStream): boolean => isTierLocked(stream.id),
    [],
  );

  // ─── Continue-watching chip data ──────────────────────────────────────────
  // Show the chip when at least one VOD history item has partial progress.
  // Selecting the chip resumes the most recent partial-watch movie.
  const resumeCandidate = useMemo<HistoryItem | null>(() => {
    for (const h of history) {
      if (h.content_type !== "vod") continue;
      if (h.duration_seconds <= 0) continue;
      const ratio = h.progress_seconds / h.duration_seconds;
      if (ratio > 0 && ratio < WATCHED_THRESHOLD) return h;
    }
    return null;
  }, [history]);

  const handleResume = useCallback(() => {
    if (!resumeCandidate) return;
    void openPlayer({
      kind: "vod",
      id: String(resumeCandidate.content_id),
      title: resumeCandidate.content_name ?? "Resume",
    });
  }, [resumeCandidate, openPlayer]);

  // ─── Focus seeding — first card on lang change / initial mount ───────────
  // Only fires when the language actually changes, so sort flips don't steal
  // focus. A timeout lets VirtuosoGrid render the first card before setFocus.
  const lastSeededLangRef = useRef<LangId | null>(null);
  useEffect(() => {
    if (sortedStreams.length === 0) return;
    if (lastSeededLangRef.current === lang) return;
    lastSeededLangRef.current = lang;
    const firstId = sortedStreams[0]!.id;
    const t = setTimeout(() => setFocus(`VOD_CARD_${firstId}`), 0);
    return () => clearTimeout(t);
  }, [lang, sortedStreams]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (stream: VodStream) => {
      void openPlayer({ kind: "vod", id: stream.id, title: stream.name });
    },
    [openPlayer],
  );

  const handleMoreInfo = useCallback((stream: VodStream) => {
    setSheetStream(stream);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSheetStream(null);
  }, []);

  const handleSortChange = useCallback((next: MovieSortKey) => {
    setSort(next);
    setSortPref(next);
  }, []);

  const handleRetry = useCallback(() => {
    invalidateLanguageUnionCache();
    setLoading(true);
    setError(false);
    setFetchGeneration((g) => g + 1);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="movies"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
          backgroundImage: "var(--hero-ambient)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 280px",
          backgroundPosition: "top center",
        }}
      >
        {loading ? (
          <div
            style={{
              padding: "var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <Skeleton width="100%" height={48} />
            <Skeleton width="100%" height={480} />
          </div>
        ) : error ? (
          <ErrorShell
            icon="network"
            title="Can't load movies"
            subtext="Check your connection and try again."
            onRetry={handleRetry}
          />
        ) : (
          <>
            <LanguageRail
              value={lang}
              onChange={setLang}
              {...(resumeCandidate
                ? { continueWatching: { onSelect: handleResume } }
                : {})}
            />

            <div
              role="toolbar"
              aria-label="Movies sort"
              style={{
                position: "sticky",
                top: 0,
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-4)",
                padding: "var(--space-3) var(--space-6)",
                background: "var(--bg-base, rgba(18, 16, 14, 0.9))",
                borderBottom: "1px solid var(--bg-surface)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div
                role="group"
                aria-label="Sort movies"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-label-size)",
                    letterSpacing: "var(--text-label-tracking)",
                    textTransform: "uppercase",
                    color: "var(--text-secondary)",
                  }}
                >
                  Sort
                </span>
                {SORT_OPTIONS.map((opt) => (
                  <SortButton
                    key={opt.id}
                    id={opt.id}
                    label={opt.label}
                    isActive={sort === opt.id}
                    onSelect={() => handleSortChange(opt.id)}
                  />
                ))}
              </div>

              <span
                aria-live="polite"
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "var(--text-label-size)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {sortedStreams.length.toLocaleString()} movies
              </span>
            </div>

            {sortedStreams.length === 0 ? (
              <EmptyStateWithLanguageSwitch
                currentLang={lang}
                onSwitch={setLang}
                headline={`No ${langLabel(lang)} movies in this catalog.`}
                message="The provider hasn't categorised any movies this way. Try another language."
              />
            ) : (
              <MovieGrid
                streams={sortedStreams}
                onSelect={handleSelect}
                onMoreInfo={handleMoreInfo}
                getProgress={getProgress}
                isWatched={isWatched}
                isTierLocked={isTierLockedFn}
              />
            )}
          </>
        )}

        {sheetStream ? (
          <MovieDetailSheet
            key={sheetStream.id}
            stream={sheetStream}
            onClose={handleCloseSheet}
            onPlay={handleSelect}
          />
        ) : null}
      </main>
    </FocusContext.Provider>
  );
}

function langLabel(lang: LangId): string {
  switch (lang) {
    case "telugu":
      return "Telugu";
    case "hindi":
      return "Hindi";
    case "english":
      return "English";
    case "sports":
      return "Sports";
    case "all":
      return "";
  }
}
