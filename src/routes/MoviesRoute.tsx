/**
 * MoviesRoute — Phase 2 rebuild.
 *
 * Spec: docs/ux/03-movies.md; plan: docs/ux/IMPLEMENTATION-PLAN.md Phase 2.
 *
 * Layout:
 *   Title "MOVIES"
 *   ResumeHero (conditional — only when /api/history has a partial VOD)
 *   LanguageRail (4 chips — no Sports; no Continue chip on Movies)
 *   Toolbar: sort segmented control + count (sticky)
 *   MovieGrid / EmptyStateWithLanguageSwitch
 *   MovieDetailSheet overlay (opens via ⋯ → More info)
 *
 * Category fetch strategy: we no longer show a CategoryStrip. Instead we
 * union all categories matching the current language pref (03-movies.md §3 —
 * "client-side language union"). Each language swap re-runs the union and
 * focus seeds to row 0 col 0. Sort flips re-order in place and never pull
 * focus.
 *
 * Focus seeding rules:
 *   - Cold mount + resume candidate → focus lands on ResumeHero
 *   - Cold mount + no resume → focus lands on first poster
 *   - Language change → focus lands on first poster (resume doesn't grab)
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
import { ResumeHero } from "../features/movies/ResumeHero";
import {
  streamLanguageUnion,
  invalidateLanguageUnionCache,
  lookupCachedStream,
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
import { fetchVodInfo } from "../api/vod";
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
  { id: "added", label: "Newest" },
  { id: "year", label: "Year" },
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
  // Distinct from `loading`: on a lang-switch the previous grid stays
  // visible until the new fetch resolves, and this flag drives a dim +
  // count-area spinner so the click is clearly acknowledged (fixes "did
  // my Hindi click register?"). Flipped to `true` in user-triggered
  // handlers (handleLangChange / handleRetry) — never synchronously in an
  // effect, which keeps react-hooks/set-state-in-effect quiet.
  const [transitioning, setTransitioning] = useState(false);
  const [sheetStream, setSheetStream] = useState<VodStream | null>(null);

  // ─── Language union fetch ─────────────────────────────────────────────────
  // Re-fetches on every language change. Errors render as error state;
  // loading on initial mount only shows the skeleton (subsequent switches
  // keep the grid mounted so focus doesn't flicker).
  const [fetchGeneration, setFetchGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;

    streamLanguageUnion(lang, ({ streams: fetched, isFinal }) => {
      if (cancelled) return;
      setStreams(fetched);
      setLoading(false);
      setError(false);
      // Dismiss the transitioning dim as soon as we have content to show,
      // or when the union is fully loaded (even if 0 results). The grid
      // keeps growing silently as remaining categories resolve.
      if (fetched.length > 0 || isFinal) {
        setTransitioning(false);
      }
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
      setError(true);
      setTransitioning(false);
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

  // ─── Resume candidate — drives the ResumeHero above the LanguageRail ─────
  // Most recent VOD history entry whose progress sits between 0 and the
  // watched threshold. Cross-language by design: a user who paused Bhediya
  // (Hindi) should still see "Resume Bhediya" when they land on /movies,
  // regardless of the current language filter.
  const resumeCandidate = useMemo<HistoryItem | null>(() => {
    for (const h of history) {
      if (h.content_type !== "vod") continue;
      if (h.duration_seconds <= 0) continue;
      const ratio = h.progress_seconds / h.duration_seconds;
      if (ratio > 0 && ratio < WATCHED_THRESHOLD) return h;
    }
    return null;
  }, [history]);

  // Backfill the resume title when history doesn't have content_name (older
  // rows, pre-capture). Without this the hero renders "Resume your movie" —
  // confirmed in prod 2026-04-23 PM. Fetches /api/vod/info/:id once per
  // candidate change; silent-fails to the current content_name / fallback.
  // Backfill is stored with the id it belongs to so a stale entry from a
  // previous candidate cannot bleed into a new one — no sync setState
  // needed in the effect to "reset" it.
  const [resumeTitleBackfill, setResumeTitleBackfill] = useState<{
    id: string;
    name: string;
  } | null>(null);
  useEffect(() => {
    if (!resumeCandidate || resumeCandidate.content_name) return;
    let cancelled = false;
    const id = String(resumeCandidate.content_id);
    fetchVodInfo(id)
      .then((info) => {
        if (!cancelled && info.name) setResumeTitleBackfill({ id, name: info.name });
      })
      .catch(() => {
        // Keep the generic fallback if info fetch fails.
      });
    return () => {
      cancelled = true;
    };
  }, [resumeCandidate]);

  // Three-tier fallback: stored content_name → already-cached stream name
  // (from any prior language union that happened to contain this id) →
  // async /api/vod/info backfill → generic label. `streams` is in the deps
  // list on purpose — its identity flips whenever a new category resolves,
  // which is the signal that `lookupCachedStream` may now return a hit.
  const resumeTitle = useMemo(() => {
    void streams; // reactivity trigger for the module-level cache below
    if (!resumeCandidate) return "your movie";
    if (resumeCandidate.content_name) return resumeCandidate.content_name;
    const candidateId = String(resumeCandidate.content_id);
    const cached = lookupCachedStream(candidateId);
    if (cached) return cached.name;
    if (resumeTitleBackfill?.id === candidateId) return resumeTitleBackfill.name;
    return "your movie";
  }, [resumeCandidate, resumeTitleBackfill, streams]);

  const handleResume = useCallback(() => {
    if (!resumeCandidate) return;
    void openPlayer({
      kind: "vod",
      id: String(resumeCandidate.content_id),
      title: resumeTitle,
    });
  }, [resumeCandidate, resumeTitle, openPlayer]);

  // ─── Focus seeding ────────────────────────────────────────────────────────
  // Two distinct paths:
  //   * Initial seed — fire once per route mount. Prefers the hero (via
  //     ResumeHero's `autoFocus` prop and its own focusSelf, which avoids
  //     the "target not registered yet" race we hit with setFocus from
  //     this effect). Falls back to the first poster when there is no
  //     resume candidate.
  //   * Language-change seed — always seed the first poster. The user is
  //     actively browsing, so a background resume-arrival must not pull
  //     focus back to the hero mid-browse.
  //
  // `heroShouldAutoFocus` is computed from refs so it stays stable across
  // re-renders once the hero mount grabs focus. It flips to `true` only on
  // the render where we decide the hero is the initial seed target.
  const didInitialSeedRef = useRef<boolean>(false);
  const lastSeededLangRef = useRef<LangId>(lang);
  const [heroShouldAutoFocus, setHeroShouldAutoFocus] = useState(false);

  useEffect(() => {
    // Initial seed path
    if (!didInitialSeedRef.current) {
      if (resumeCandidate) {
        didInitialSeedRef.current = true;
        lastSeededLangRef.current = lang;
        // Hero's own focusSelf handles registration timing. This setState
        // is a one-shot guarded by a ref so it cannot loop — the rule
        // can't tell the difference between cascading updates and one-time
        // imperatives.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHeroShouldAutoFocus(true);
        return;
      }
      if (sortedStreams.length > 0) {
        didInitialSeedRef.current = true;
        lastSeededLangRef.current = lang;
        const firstId = sortedStreams[0]!.id;
        const t = setTimeout(() => setFocus(`VOD_CARD_${firstId}`), 0);
        return () => clearTimeout(t);
      }
      return;
    }

    // Language-change seed path
    if (lastSeededLangRef.current !== lang && sortedStreams.length > 0) {
      lastSeededLangRef.current = lang;
      const firstId = sortedStreams[0]!.id;
      const t = setTimeout(() => setFocus(`VOD_CARD_${firstId}`), 0);
      return () => clearTimeout(t);
    }
  }, [lang, sortedStreams, resumeCandidate]);

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

  // Wrap setLang so a chip click flips `transitioning` immediately —
  // otherwise the old grid keeps rendering with no visual acknowledgement
  // until the new language's fetch resolves.
  const handleLangChange = useCallback(
    (next: LangId) => {
      setTransitioning(true);
      setLang(next);
    },
    [setLang],
  );

  const handleRetry = useCallback(() => {
    invalidateLanguageUnionCache();
    setLoading(true);
    setError(false);
    setTransitioning(true);
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
            {resumeCandidate ? (
              <ResumeHero
                title={resumeTitle}
                remainingSeconds={
                  resumeCandidate.duration_seconds -
                  resumeCandidate.progress_seconds
                }
                onSelect={handleResume}
                shouldAutoFocus={heroShouldAutoFocus}
              />
            ) : null}

            <LanguageRail value={lang} onChange={handleLangChange} />

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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                {transitioning ? (
                  <span
                    aria-hidden="true"
                    data-testid="movies-transitioning-dot"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 9999,
                      background: "var(--accent-copper)",
                      animation: "movies-pulse 900ms ease-in-out infinite",
                    }}
                  />
                ) : null}
                {transitioning
                  ? `Loading ${langLabel(lang) || "all"} movies…`
                  : `${sortedStreams.length.toLocaleString()} movies`}
              </span>
            </div>
            <style>{`
              @keyframes movies-pulse {
                0%, 100% { opacity: 0.35; transform: scale(0.85); }
                50%      { opacity: 1;    transform: scale(1.1);  }
              }
              @media (prefers-reduced-motion: reduce) {
                [data-testid="movies-transitioning-dot"] { animation: none !important; }
              }
            `}</style>

            <div
              style={{
                position: "relative",
                opacity: transitioning ? 0.4 : 1,
                pointerEvents: transitioning ? "none" : "auto",
                transition: "opacity 180ms ease-out",
              }}
              aria-busy={transitioning || undefined}
            >
              {sortedStreams.length === 0 && !transitioning ? (
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
            </div>
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
