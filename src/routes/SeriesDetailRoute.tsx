/**
 * SeriesDetailRoute — `/series/:id` detail page with seasons + episode picker.
 *
 * Responsibilities:
 *  - Fetch `GET /api/series/info/:id` on mount (seasons + episodes).
 *  - Fetch `/api/history` to determine resume state.
 *  - Hero CTA: "Play S1E1" (cold) | "Continue S{n}E{n}" (in-progress) |
 *    "Rewatch S1E1" (all watched). Auto-focused on arrival → 1 Enter = watching.
 *  - Season tabs: horizontal chip rail, D-pad ArrowLeft/Right.
 *    Season 0 renders as "Specials", sorted to end.
 *  - Episode list: vertical rows, D-pad ArrowUp/Down.
 *    Enter on an episode row opens the player (series-episode kind).
 *  - Back button / Escape → navigate(-1) back to prior surface.
 *  - Reuses ErrorShell, Skeleton, FocusContext patterns from LiveRoute.
 *
 * MUST PRESERVE: CONTENT_AREA_SERIES_DETAIL FocusContext registration
 * (prevents BottomDock focus conflicts when this route is active).
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { useParams, useNavigate } from "react-router-dom";
import { ErrorShell } from "../primitives/ErrorShell";
import { Skeleton } from "../primitives/Skeleton";
import { OverflowMenu } from "../components/OverflowMenu";
import { fetchSeriesInfo } from "../api/series";
import { fetchHistory, recordHistory, removeHistoryItem } from "../api/history";
import { usePlayerStore } from "../player/PlayerProvider";
import { fetchStreamUrl } from "../api/stream";
import type { SeriesInfo, EpisodeInfo, SeasonInfo, HistoryItem } from "../api/schemas";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatProgress(progress: number, duration: number): string {
  return `${formatDuration(progress)} / ${formatDuration(duration)}`;
}

/** Sort seasons: numeric ascending, season 0 ("Specials") moved to end. */
function sortSeasons(seasons: SeasonInfo[]): SeasonInfo[] {
  return [...seasons].sort((a, b) => {
    if (a.seasonNumber === 0) return 1;
    if (b.seasonNumber === 0) return -1;
    return a.seasonNumber - b.seasonNumber;
  });
}

function seasonLabel(s: SeasonInfo): string {
  if (s.seasonNumber === 0) return "Specials";
  return s.name || `Season ${s.seasonNumber}`;
}

// ─── SeasonTab ────────────────────────────────────────────────────────────────

function SeasonTab({
  season,
  isActive,
  onSelect,
}: {
  season: SeasonInfo;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { ref, focused } = useFocusable({
    focusKey: `SERIES_DETAIL_SEASON_${season.seasonNumber}`,
    onEnterPress: onSelect,
  });
  const active = isActive || focused;

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      className="focus-ring"
      aria-pressed={isActive}
      onClick={onSelect}
      style={{
        padding: "var(--space-2) var(--space-5)",
        borderRadius: "var(--radius-pill)",
        border: isActive
          ? "2px solid var(--accent-copper)"
          : "2px solid transparent",
        background: active ? "var(--accent-copper)" : "var(--bg-surface)",
        color: active ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-body-size)",
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      {seasonLabel(season)}
    </button>
  );
}

// ─── EpisodeRow ───────────────────────────────────────────────────────────────

interface EpisodeRowProps {
  episode: EpisodeInfo;
  seriesId: string;
  seasonNumber: number;
  historyItem: HistoryItem | undefined;
}

function EpisodeRow({ episode, seriesId, seasonNumber, historyItem }: EpisodeRowProps) {
  const { open } = usePlayerStore();
  const focusKey = `SERIES_DETAIL_EP_${seriesId}_S${seasonNumber}_${episode.id}`;
  const overflowFocusKey = `EPISODE_OVERFLOW_${seriesId}_S${seasonNumber}_${episode.id}`;

  const playEpisode = useCallback(() => {
    const streamUrl = fetchStreamUrl({
      kind: "series-episode",
      id: episode.id,
    });
    open({
      src: streamUrl,
      title: `S${seasonNumber}E${episode.episodeNumber} · ${episode.title}`,
      kind: "series-episode",
    });
  }, [episode, seasonNumber, open]);

  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey,
    onEnterPress: playEpisode,
  });

  const progress = historyItem?.progress_seconds ?? 0;
  const duration = historyItem?.duration_seconds ?? episode.duration ?? 0;
  const isWatched = duration > 0 && progress >= duration * 0.9;
  const isInProgress = progress > 0 && !isWatched;

  // ⋯ overflow actions for this episode
  // TODO(#58): recordHistory uses optimistic localStorage write; the backend
  // PATCH /api/history/:id upsert will sync it server-side when reachable.
  // removeHistoryItem is localStorage-only; no backend DELETE exists in the
  // current phase — see history.ts.
  const overflowActions = useMemo(() => [
    {
      label: "Mark as watched",
      onSelect: () => {
        if (duration > 0) {
          void recordHistory(Number(episode.id), {
            content_type: "series",
            content_name: `S${seasonNumber}E${episode.episodeNumber} · ${episode.title}`,
            content_icon: episode.icon ?? undefined,
            progress_seconds: duration,
            duration_seconds: duration,
          });
        }
      },
    },
    {
      label: "Remove from history",
      onSelect: () => {
        removeHistoryItem(Number(episode.id), "series");
      },
    },
  ], [episode, seasonNumber, duration]);

  return (
    // Outer wrapper — not a button; holds both the play row + overflow trigger.
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        gap: 0,
        width: "100%",
        background: focused ? "var(--bg-elevated)" : "transparent",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid transparent",
        borderRadius: "var(--radius-sm)",
        transition: "background var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      {/* Play button — the episode row itself */}
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        onClick={playEpisode}
        aria-label={`Season ${seasonNumber} Episode ${episode.episodeNumber}: ${episode.title}`}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)",
          background: "transparent",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
          textAlign: "left",
          minWidth: 0,
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            flexShrink: 0,
            width: 160,
            height: 90,
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
          }}
        >
          {episode.icon ? (
            <img
              src={episode.icon}
              alt=""
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: "100%",
                height: "100%",
                background: "var(--bg-elevated)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                color: "var(--text-secondary)",
              }}
            >
              {isWatched ? "✓" : isInProgress ? "⏵" : "▶"}
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-2)" }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: isWatched ? "var(--text-secondary)" : "var(--text-primary)",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {episode.episodeNumber}. {episode.title}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: "var(--text-label-size)",
                color: "var(--text-secondary)",
              }}
            >
              {episode.duration !== undefined
                ? formatDuration(episode.duration)
                : null}
            </span>
          </div>

          {episode.plot && (
            <p
              style={{
                margin: 0,
                fontSize: 16,
                color: "var(--text-secondary)",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {episode.plot}
            </p>
          )}

          {/* Progress bar for in-progress episodes */}
          {isInProgress && duration > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: "var(--bg-surface)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, (progress / duration) * 100)}%`,
                    height: "100%",
                    background: "var(--accent-copper)",
                  }}
                />
              </div>
              <span style={{ fontSize: "var(--text-label-size)", color: "var(--text-secondary)", flexShrink: 0 }}>
                {formatProgress(progress, duration)}
              </span>
            </div>
          )}

          {/* State glyph */}
          {isWatched && (
            <span style={{ fontSize: "var(--text-label-size)", color: "var(--accent-copper)" }}>
              Watched
            </span>
          )}
        </div>
      </button>

      {/* ⋯ overflow menu — right-aligned, reachable via ArrowRight from episode row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 var(--space-3)",
          flexShrink: 0,
        }}
      >
        <OverflowMenu
          focusKey={overflowFocusKey}
          actions={overflowActions}
          triggerLabel={`More actions for Episode ${episode.episodeNumber}: ${episode.title}`}
          placement="below"
        />
      </div>
    </div>
  );
}

// ─── HeroCTA ─────────────────────────────────────────────────────────────────

interface HeroCtaProps {
  label: string;
  ariaLabel: string;
  onPress: () => void;
}

function HeroCta({ label, ariaLabel, onPress }: HeroCtaProps) {
  const { ref, focused } = useFocusable({
    focusKey: "SERIES_DETAIL_PLAY_CTA",
    onEnterPress: onPress,
  });

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      className="focus-ring"
      aria-label={ariaLabel}
      onClick={onPress}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-6)",
        background: focused ? "var(--accent-copper)" : "var(--bg-elevated)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid var(--bg-surface)",
        borderRadius: "var(--radius-sm)",
        color: focused ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-body-size)",
        fontWeight: 600,
        cursor: "pointer",
        minWidth: 200,
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      <span aria-hidden="true">▶</span>
      {label}
    </button>
  );
}

// ─── SeriesDetailRoute ────────────────────────────────────────────────────────

interface ResumeState {
  seasonNumber: number;
  episodeId: string;
  episodeNumber: number;
  label: string;
  ariaLabel: string;
  progress: number;
  duration: number;
}

export function SeriesDetailRoute() {
  const { id: seriesId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { open } = usePlayerStore();

  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_SERIES_DETAIL",
    focusable: false,
    trackChildren: true,
  });

  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSeasonNumber, setActiveSeasonNumber] = useState<number>(1);

  // Track whether initial focus has been seeded (only once on mount).
  const focusSeeded = useRef(false);

  // ─── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesId) return;

    let cancelled = false;

    // Promise.resolve() indirection: defers the first setState call out of
    // the synchronous effect body — satisfies react-hooks/set-state-in-effect.
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoading(true);
        setError(false);
        return Promise.all([
          fetchSeriesInfo(seriesId),
          fetchHistory().catch((): HistoryItem[] => []),
        ]);
      })
      .then((result) => {
        if (cancelled || result === undefined) return;
        const [seriesInfo, hist] = result;
        setInfo(seriesInfo);
        setHistory(hist);
        // Seed active season: prefer in-progress season from history,
        // fall back to first sorted season.
        const sorted = sortSeasons(seriesInfo.seasons ?? []);
        const defaultSeason = sorted[0]?.seasonNumber ?? 1;
        // Quick resume-season probe from history (mirrors the useMemo logic below).
        const histMap = new Map<string, HistoryItem>();
        for (const h of hist) {
          if (h.content_type === "series") histMap.set(String(h.content_id), h);
        }
        let seededSeason = defaultSeason;
        let latestWatchedAt = 0;
        for (const [seasonKey, eps] of Object.entries(seriesInfo.episodes ?? {})) {
          const sn = Number(seasonKey);
          for (const ep of eps) {
            const h = histMap.get(ep.id);
            if (!h) continue;
            const prog = h.progress_seconds;
            const dur = h.duration_seconds || ep.duration || 0;
            const isWatched = dur > 0 && prog >= dur * 0.9;
            if (!isWatched && prog > 0) {
              const wa = new Date(h.watched_at).getTime();
              if (wa > latestWatchedAt) {
                latestWatchedAt = wa;
                seededSeason = sn;
              }
            }
          }
        }
        setActiveSeasonNumber(seededSeason);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  const handleRetry = useCallback(() => {
    if (!seriesId) return;

    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoading(true);
        setError(false);
        return Promise.all([
          fetchSeriesInfo(seriesId),
          fetchHistory().catch((): HistoryItem[] => []),
        ]);
      })
      .then((result) => {
        if (cancelled || result === undefined) return;
        const [seriesInfo, hist] = result;
        setInfo(seriesInfo);
        setHistory(hist);
        const sorted = sortSeasons(seriesInfo.seasons ?? []);
        const defaultSeason = sorted[0]?.seasonNumber ?? 1;
        const histMap = new Map<string, HistoryItem>();
        for (const h of hist) {
          if (h.content_type === "series") histMap.set(String(h.content_id), h);
        }
        let seededSeason = defaultSeason;
        let latestWatchedAt = 0;
        for (const [seasonKey, eps] of Object.entries(seriesInfo.episodes ?? {})) {
          const sn = Number(seasonKey);
          for (const ep of eps) {
            const h = histMap.get(ep.id);
            if (!h) continue;
            const prog = h.progress_seconds;
            const dur = h.duration_seconds || ep.duration || 0;
            const isWatched = dur > 0 && prog >= dur * 0.9;
            if (!isWatched && prog > 0) {
              const wa = new Date(h.watched_at).getTime();
              if (wa > latestWatchedAt) {
                latestWatchedAt = wa;
                seededSeason = sn;
              }
            }
          }
        }
        setActiveSeasonNumber(seededSeason);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  // ─── Resume logic ────────────────────────────────────────────────────────
  // Find in-progress or most-recently-watched series episode from history.
  // History content_id is the numeric episode id from the backend.
  // We match against string episode ids (converting content_id to string).

  const allEpisodes = useMemo<{ season: number; ep: EpisodeInfo }[]>(() => {
    if (!info?.episodes) return [];
    const result: { season: number; ep: EpisodeInfo }[] = [];
    for (const [seasonKey, eps] of Object.entries(info.episodes)) {
      const sn = Number(seasonKey);
      for (const ep of eps) {
        result.push({ season: sn, ep });
      }
    }
    return result;
  }, [info]);

  // Build a map from episode id string → history item for fast lookup.
  const historyByEpId = useMemo<Map<string, HistoryItem>>(() => {
    const m = new Map<string, HistoryItem>();
    for (const h of history) {
      if (h.content_type === "series") {
        m.set(String(h.content_id), h);
      }
    }
    return m;
  }, [history]);

  // Determine CTA state — derived from allEpisodes + historyByEpId.
  const { resumeState, allWatched } = useMemo<{
    resumeState: ResumeState | null;
    allWatched: boolean;
  }>(() => {
    if (allEpisodes.length === 0) return { resumeState: null, allWatched: false };

    // Find the most recently in-progress episode.
    let inProgressEp: typeof allEpisodes[0] | undefined;
    let inProgressHist: HistoryItem | undefined;
    let latestWatchedAt = 0;

    for (const { season, ep } of allEpisodes) {
      const h = historyByEpId.get(ep.id);
      if (!h) continue;
      const prog = h.progress_seconds;
      const dur = h.duration_seconds || ep.duration || 0;
      const isWatched = dur > 0 && prog >= dur * 0.9;
      if (!isWatched && prog > 0) {
        const wa = new Date(h.watched_at).getTime();
        if (wa > latestWatchedAt) {
          latestWatchedAt = wa;
          inProgressEp = { season, ep };
          inProgressHist = h;
        }
      }
    }

    if (inProgressEp && inProgressHist) {
      const prog = inProgressHist.progress_seconds;
      const dur = inProgressHist.duration_seconds || inProgressEp.ep.duration || 0;
      return {
        resumeState: {
          seasonNumber: inProgressEp.season,
          episodeId: inProgressEp.ep.id,
          episodeNumber: inProgressEp.ep.episodeNumber,
          label: `Continue S${inProgressEp.season}E${inProgressEp.ep.episodeNumber}`,
          ariaLabel: `Continue Season ${inProgressEp.season} Episode ${inProgressEp.ep.episodeNumber} from ${formatProgress(prog, dur)}`,
          progress: prog,
          duration: dur,
        },
        allWatched: false,
      };
    }

    // Check if all episodes are watched.
    const watchedCount = allEpisodes.filter(({ ep }) => {
      const h = historyByEpId.get(ep.id);
      if (!h) return false;
      const dur = h.duration_seconds || ep.duration || 0;
      return dur > 0 && h.progress_seconds >= dur * 0.9;
    }).length;

    return {
      resumeState: null,
      allWatched: watchedCount === allEpisodes.length && allEpisodes.length > 0,
    };
  }, [allEpisodes, historyByEpId]);

  // ─── Derive sorted seasons ──────────────────────────────────────────────
  const sortedSeasons = useMemo(
    () => sortSeasons(info?.seasons ?? []),
    [info],
  );

  // ─── Seed focus to CTA once loaded ──────────────────────────────────────
  useEffect(() => {
    if (!loading && !error && !focusSeeded.current) {
      focusSeeded.current = true;
      // Short defer — norigin child registration races mount.
      const t = setTimeout(() => {
        setFocus("SERIES_DETAIL_PLAY_CTA");
      }, 80);
      return () => clearTimeout(t);
    }
  }, [loading, error]);

  // ─── Play handler ────────────────────────────────────────────────────────
  const playEpisode = useCallback(
    (ep: EpisodeInfo, seasonNum: number) => {
      const streamUrl = fetchStreamUrl({
        kind: "series-episode",
        id: ep.id,
      });
      open({
        src: streamUrl,
        title: `S${seasonNum}E${ep.episodeNumber} · ${ep.title}`,
        kind: "series-episode",
      });
    },
    [open],
  );

  const handleCtaPress = useCallback(() => {
    if (!info) return;
    if (resumeState) {
      // Resume the in-progress episode.
      const ep = allEpisodes.find(
        ({ ep: e }) => e.id === resumeState!.episodeId,
      );
      if (ep) playEpisode(ep.ep, ep.season);
      return;
    }
    // Play first episode of first season (or S1E1).
    const firstSeason = sortedSeasons[0];
    if (!firstSeason) return;
    const seasonKey = String(firstSeason.seasonNumber);
    const eps = info.episodes?.[seasonKey] ?? [];
    const firstEp = eps[0];
    if (firstEp) playEpisode(firstEp, firstSeason.seasonNumber);
  }, [info, resumeState, allEpisodes, sortedSeasons, playEpisode]);

  // ─── Back handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const isTextInput = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA";
      if (e.key === "Escape" || (e.key === "Backspace" && !isTextInput)) {
        navigate(-1);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  // ─── CTA label ──────────────────────────────────────────────────────────
  let ctaLabel = "Play S1E1";
  let ctaAriaLabel = "Play Season 1 Episode 1";
  if (resumeState) {
    ctaLabel = resumeState.label;
    ctaAriaLabel = resumeState.ariaLabel;
  } else if (allWatched) {
    ctaLabel = "Rewatch S1E1";
    ctaAriaLabel = "Rewatch Season 1 Episode 1 from the beginning";
  }

  // ─── Episodes for active season ─────────────────────────────────────────
  const activeEpisodes: EpisodeInfo[] =
    info?.episodes?.[String(activeSeasonNumber)] ?? [];

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="series-detail"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
          backgroundImage: "var(--hero-ambient)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 320px",
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
            <Skeleton width="100%" height={200} />
            <Skeleton width="100%" height={52} />
            <Skeleton width="100%" height={400} />
          </div>
        ) : error ? (
          <ErrorShell
            icon="network"
            title="Can't load this series"
            subtext="Check your connection and try again."
            onRetry={handleRetry}
            onBack={() => navigate(-1)}
            backLabel="Back to list"
          />
        ) : info ? (
          <>
            {/* ── Hero ──────────────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: "var(--space-6)",
                padding: "var(--space-6)",
                alignItems: "flex-start",
              }}
            >
              {/* Poster */}
              <div
                style={{
                  flexShrink: 0,
                  width: 160,
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  background: "var(--bg-surface)",
                }}
              >
                {info.icon ? (
                  <img
                    src={info.icon}
                    alt={info.name}
                    style={{ width: "100%", display: "block" }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 160,
                      height: 220,
                      background: "var(--bg-elevated)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 48,
                      color: "var(--text-secondary)",
                    }}
                  >
                    ⊞
                  </div>
                )}
              </div>

              {/* Title + meta + CTA */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontSize: "var(--text-title-size, 32px)",
                    color: "var(--text-primary)",
                  }}
                >
                  {info.name}
                </h1>

                {/* Meta row */}
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-label-size)",
                    flexWrap: "wrap",
                  }}
                >
                  {info.rating && <span>★ {info.rating}</span>}
                  {info.year && <span>{info.year}</span>}
                  {info.genre && <span>{info.genre}</span>}
                  {sortedSeasons.length > 0 && (
                    <span>
                      {sortedSeasons.length}{" "}
                      {sortedSeasons.length === 1 ? "Season" : "Seasons"}
                    </span>
                  )}
                </div>

                {/* Synopsis */}
                {info.plot && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 16,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {info.plot}
                  </p>
                )}

                {/* CTA row */}
                <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
                  <HeroCta
                    label={ctaLabel}
                    ariaLabel={ctaAriaLabel}
                    onPress={handleCtaPress}
                  />
                </div>

                {/* Resume progress bar (shown under CTA when in-progress) */}
                {resumeState && resumeState.duration > 0 && (
                  <div
                    style={{
                      width: 200,
                      height: 4,
                      background: "var(--bg-surface)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (resumeState.progress / resumeState.duration) * 100)}%`,
                        height: "100%",
                        background: "var(--accent-copper)",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── Season rail ───────────────────────────────────────── */}
            {sortedSeasons.length > 0 && (
              <div
                role="toolbar"
                aria-label="Season selector"
                style={{
                  display: "flex",
                  flexWrap: "nowrap",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-6)",
                  overflowX: "auto",
                  borderTop: "1px solid var(--bg-surface)",
                  borderBottom: "1px solid var(--bg-surface)",
                }}
              >
                {sortedSeasons.map((season) => (
                  <SeasonTab
                    key={season.seasonNumber}
                    season={season}
                    isActive={activeSeasonNumber === season.seasonNumber}
                    onSelect={() => setActiveSeasonNumber(season.seasonNumber)}
                  />
                ))}
              </div>
            )}

            {/* ── Episode list ──────────────────────────────────────── */}
            <div
              style={{
                padding: "var(--space-4) var(--space-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              {sortedSeasons.length > 0 && (
                <h2
                  style={{
                    margin: "0 0 var(--space-3) 0",
                    fontSize: "var(--text-label-size)",
                    color: "var(--text-secondary)",
                    letterSpacing: "var(--text-label-tracking)",
                    textTransform: "uppercase",
                  }}
                >
                  {(() => {
                    const s =
                      sortedSeasons.find(
                        (ss) => ss.seasonNumber === activeSeasonNumber,
                      ) ?? sortedSeasons[0];
                    return s ? seasonLabel(s) : "";
                  })()}
                </h2>
              )}

              {activeEpisodes.length === 0 ? (
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-body-size)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  No episodes in this season yet.
                </p>
              ) : (
                activeEpisodes.map((ep) => (
                  <EpisodeRow
                    key={ep.id}
                    episode={ep}
                    seriesId={seriesId ?? ""}
                    seasonNumber={activeSeasonNumber}
                    historyItem={historyByEpId.get(ep.id)}
                  />
                ))
              )}
            </div>
          </>
        ) : null}
      </main>
    </FocusContext.Provider>
  );
}
