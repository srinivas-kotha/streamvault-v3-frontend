/**
 * SeriesRoute — /series list (Phase 4a rebuild).
 *
 * Spec: docs/ux/02-series.md. Mirrors the Movies pattern:
 *   Title row
 *   ResumeHero (when a series history entry is partially watched)
 *   LanguageRail (Telugu / Hindi / English / All — no Sports)
 *   Sticky toolbar: sort segmented control + count
 *   Series grid (poster cards)
 *
 * Card Enter = navigate('/series/:id'), NEVER openPlayer. Play lives on the
 * detail page. This is the critical contract — the "series buffers forever"
 * bug was a misrouted series id being treated as an episode stream.
 *
 * Language union uses inferLanguage patterns (mirrors backend service) so a
 * Hindi filter picks up "Bollywood Classics", English picks up "Netflix
 * Originals", etc. — broader than Movies' narrow word-boundary match.
 *
 * MUST PRESERVE: CONTENT_AREA_SERIES focus key + FocusContext — load-bearing
 * for BottomDock's setFocus("CONTENT_AREA_SERIES") on ArrowUp.
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { useNavigate } from "react-router-dom";
import { SeriesGrid } from "../features/series/SeriesGrid";
import { SeriesCard } from "../features/series/SeriesCard";
import {
  streamSeriesLanguageUnion,
  invalidateSeriesLanguageUnionCache,
} from "../features/series/seriesLanguageUnion";
import {
  getSortPref,
  setSortPref,
  sortSeriesItems,
  type SeriesSortKey,
} from "../features/series/sortSeries";
import { LanguageRail } from "../components/LanguageRail";
import { ResumeHero } from "../features/movies/ResumeHero";
import { ErrorShell } from "../primitives/ErrorShell";
import { Skeleton } from "../primitives/Skeleton";
import { EmptyStateWithLanguageSwitch } from "../primitives/EmptyStateWithLanguageSwitch";
import { useLangPref } from "../lib/useLangPref";
import { fetchHistory } from "../api/history";
import { usePlayerOpener } from "../player/usePlayerOpener";
import type { HistoryItem, SeriesItem } from "../api/schemas";
import type { LangId } from "../lib/langPref";

const WATCHED_THRESHOLD = 0.9;
const NEW_DAYS = 14;

interface SortButtonProps {
  id: SeriesSortKey;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}

function SortButton({ id, label, isActive, onSelect }: SortButtonProps) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: `SERIES_SORT_${id.toUpperCase()}`,
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

const SORT_OPTIONS: { id: SeriesSortKey; label: string }[] = [
  { id: "added", label: "Newest" },
  { id: "name", label: "Name" },
];

/**
 * Parses a series-episode history content_name. The convention written by
 * SeriesDetailRoute.playEpisode is "SeriesName · S{n}E{m} · Title"; legacy
 * rows may be just "S{n}E{m} · Title" (no series prefix).
 */
function parseEpisodeName(name: string | null | undefined): {
  series: string | null;
  sEp: string | null;
} {
  if (!name) return { series: null, sEp: null };
  const parts = name.split(" · ").map((s) => s.trim()).filter(Boolean);
  const sEpRe = /^S\d+E\d+$/i;
  if (parts.length >= 3 && sEpRe.test(parts[1]!)) {
    return { series: parts[0]!, sEp: parts[1]! };
  }
  if (parts.length === 2 && sEpRe.test(parts[0]!)) {
    return { series: null, sEp: parts[0]! };
  }
  return { series: null, sEp: null };
}

function isNewSeries(addedIso: string | null | undefined): boolean {
  if (!addedIso) return false;
  const t = Date.parse(addedIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < NEW_DAYS * 24 * 60 * 60 * 1000;
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

export function SeriesRoute() {
  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_SERIES",
    focusable: false,
    trackChildren: true,
  });

  const navigate = useNavigate();
  const { openPlayer } = usePlayerOpener();
  const [lang, setLang] = useLangPref({ excludeSports: true });
  const [sort, setSort] = useState<SeriesSortKey>(() => getSortPref());
  const [items, setItems] = useState<SeriesItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [fetchGeneration, setFetchGeneration] = useState(0);

  // ─── Language union fetch ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    streamSeriesLanguageUnion(lang, ({ items: batch, isFinal }) => {
      if (cancelled) return;
      setItems(batch);
      setLoading(false);
      setError(false);
      if (batch.length > 0 || isFinal) {
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
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch(() => {
        // history is optional
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Derived: sorted items ────────────────────────────────────────────────
  const sortedItems = useMemo(
    () => sortSeriesItems(items, sort),
    [items, sort],
  );

  // ─── Resume candidate — most-recent in-progress SERIES episode ────────────
  const resumeCandidate = useMemo<HistoryItem | null>(() => {
    let best: HistoryItem | null = null;
    let bestAt = 0;
    for (const h of history) {
      if (h.content_type !== "series") continue;
      if (h.duration_seconds <= 0) continue;
      const ratio = h.progress_seconds / h.duration_seconds;
      if (ratio <= 0 || ratio >= WATCHED_THRESHOLD) continue;
      const at = Date.parse(h.watched_at);
      if (!Number.isFinite(at)) continue;
      if (at > bestAt) {
        bestAt = at;
        best = h;
      }
    }
    return best;
  }, [history]);

  const resumeLabel = useMemo<string>(() => {
    if (!resumeCandidate) return "your episode";
    const parsed = parseEpisodeName(resumeCandidate.content_name);
    if (parsed.sEp && parsed.series) return `${parsed.sEp} of ${parsed.series}`;
    if (parsed.sEp) return parsed.sEp;
    return resumeCandidate.content_name ?? "your episode";
  }, [resumeCandidate]);

  const handleResume = useCallback(() => {
    if (!resumeCandidate) return;
    const title = resumeCandidate.content_name ?? `Resume ${resumeLabel}`;
    void openPlayer({
      kind: "series-episode",
      id: String(resumeCandidate.content_id),
      title,
    });
  }, [resumeCandidate, resumeLabel, openPlayer]);

  // ─── Focus seeding (mirrors MoviesRoute) ──────────────────────────────────
  const didInitialSeedRef = useRef<boolean>(false);
  const lastSeededLangRef = useRef<LangId>(lang);
  const [heroShouldAutoFocus, setHeroShouldAutoFocus] = useState(false);

  useEffect(() => {
    if (!didInitialSeedRef.current) {
      if (resumeCandidate) {
        didInitialSeedRef.current = true;
        lastSeededLangRef.current = lang;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHeroShouldAutoFocus(true);
        return;
      }
      if (sortedItems.length > 0) {
        didInitialSeedRef.current = true;
        lastSeededLangRef.current = lang;
        const firstId = sortedItems[0]!.id;
        const t = setTimeout(() => setFocus(`SERIES_CARD_${firstId}`), 0);
        return () => clearTimeout(t);
      }
      return;
    }

    if (lastSeededLangRef.current !== lang && sortedItems.length > 0) {
      lastSeededLangRef.current = lang;
      const firstId = sortedItems[0]!.id;
      const t = setTimeout(() => setFocus(`SERIES_CARD_${firstId}`), 0);
      return () => clearTimeout(t);
    }
  }, [lang, sortedItems, resumeCandidate]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleCardClick = useCallback(
    (id: string) => {
      navigate(`/series/${encodeURIComponent(id)}`);
    },
    [navigate],
  );

  const handleSortChange = useCallback((next: SeriesSortKey) => {
    setSort(next);
    setSortPref(next);
  }, []);

  const handleLangChange = useCallback(
    (next: LangId) => {
      setTransitioning(true);
      setLang(next);
    },
    [setLang],
  );

  const handleRetry = useCallback(() => {
    invalidateSeriesLanguageUnionCache();
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
        data-page="series"
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
            title="Can't load series"
            subtext="Check your connection and try again."
            onRetry={handleRetry}
          />
        ) : (
          <>
            {resumeCandidate ? (
              <ResumeHero
                title={resumeLabel}
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
              aria-label="Series sort"
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
                aria-label="Sort series"
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
                    data-testid="series-transitioning-dot"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 9999,
                      background: "var(--accent-copper)",
                      animation: "series-pulse 900ms ease-in-out infinite",
                    }}
                  />
                ) : null}
                {transitioning
                  ? `Loading ${langLabel(lang) || "all"} series…`
                  : `${sortedItems.length.toLocaleString()} series`}
              </span>
            </div>
            <style>{`
              @keyframes series-pulse {
                0%, 100% { opacity: 0.35; transform: scale(0.85); }
                50%      { opacity: 1;    transform: scale(1.1);  }
              }
              @media (prefers-reduced-motion: reduce) {
                [data-testid="series-transitioning-dot"] { animation: none !important; }
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
              {sortedItems.length === 0 && !transitioning ? (
                <EmptyStateWithLanguageSwitch
                  currentLang={lang}
                  onSwitch={setLang}
                  headline={`No ${langLabel(lang)} series in this catalog.`}
                  message="The provider hasn't categorised any series this way. Try another language."
                />
              ) : (
                <SeriesGrid
                  items={sortedItems}
                  onCardClick={handleCardClick}
                  renderCard={(item) => (
                    <SeriesCard
                      key={item.id}
                      item={item}
                      onClick={handleCardClick}
                      isNew={isNewSeries(item.added)}
                    />
                  )}
                />
              )}
            </div>
          </>
        )}
      </main>
    </FocusContext.Provider>
  );
}
