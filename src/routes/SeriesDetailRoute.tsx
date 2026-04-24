/**
 * SeriesDetailRoute — /series/:id (Phase 4b rebuild).
 *
 * Spec: docs/ux/02-series.md §3-§8.
 *
 * Changes vs previous iteration:
 *  - Full backdrop image (dimmed) behind the hero.
 *  - Complete hero CTA branches: "Continue S_E_" | "Play next episode" |
 *    "Rewatch S1E1" | "Play S1E1". The "Play next" branch fires when the
 *    most-recent episode crossed the 0.9 watched threshold.
 *  - ♥ Favorite toggle + "Mark all watched" button in the CTA row.
 *  - Episode sort controls: Latest First / Oldest First / Episode # (user
 *    ask 2026-04-23). Persists in sv_episode_sort.
 *  - Season persistence: sv_series_last_season:{seriesId} remembers the
 *    active season between visits (spec §10).
 *  - Episode title convention includes series name: "Panchayat · S2E4 ·
 *    Title" — enables ResumeHero on /series to label episodes with their
 *    series without the (not-yet-migrated) series_id column.
 *
 * Focus:
 *  - CONTENT_AREA_SERIES_DETAIL (trackChildren) registered on mount.
 *  - SERIES_DETAIL_PLAY_CTA auto-focused once the data is loaded.
 *  - Escape / Backspace → navigate(-1).
 */
import type { RefObject } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { Virtuoso } from "react-virtuoso";
import { useParams, useNavigate } from "react-router-dom";
import { ErrorShell } from "../primitives/ErrorShell";
import { Skeleton } from "../primitives/Skeleton";
import { OverflowMenu } from "../components/OverflowMenu";
import { fetchSeriesInfo } from "../api/series";
import { fetchHistory, recordHistory, removeHistoryItem } from "../api/history";
import {
  addFavorite,
  removeFavorite,
  isFavorited,
} from "../api/favorites";
import { usePlayerOpener } from "../player/usePlayerOpener";
import { usePlayerStore } from "../player/PlayerProvider";
import type {
  SeriesInfo,
  EpisodeInfo,
  SeasonInfo,
  HistoryItem,
} from "../api/schemas";

// ─── Constants ───────────────────────────────────────────────────────────────

const WATCHED_THRESHOLD = 0.9;
const EPISODE_SORT_KEY = "sv_episode_sort";
const SEASON_KEY_PREFIX = "sv_series_last_season:";

type EpisodeSortKey = "latest" | "oldest" | "episode";

const EPISODE_SORT_OPTIONS: { id: EpisodeSortKey; label: string }[] = [
  { id: "latest", label: "Latest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "episode", label: "Episode #" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatProgress(progress: number, duration: number): string {
  return `${formatDuration(progress)} / ${formatDuration(duration)}`;
}

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

function sortEpisodes(
  episodes: readonly EpisodeInfo[],
  key: EpisodeSortKey,
): EpisodeInfo[] {
  const copy = episodes.slice();
  if (key === "episode") {
    copy.sort((a, b) => a.episodeNumber - b.episodeNumber);
    return copy;
  }
  copy.sort((a, b) => {
    const ta = a.added ? Date.parse(a.added) : NaN;
    const tb = b.added ? Date.parse(b.added) : NaN;
    const aValid = Number.isFinite(ta);
    const bValid = Number.isFinite(tb);
    if (aValid && bValid) {
      return key === "latest" ? tb - ta : ta - tb;
    }
    if (aValid) return -1;
    if (bValid) return 1;
    // Both missing `added` — fall back to episode number in requested direction.
    return key === "latest"
      ? b.episodeNumber - a.episodeNumber
      : a.episodeNumber - b.episodeNumber;
  });
  return copy;
}

function readEpisodeSort(): EpisodeSortKey {
  try {
    const v = localStorage.getItem(EPISODE_SORT_KEY);
    if (v === "latest" || v === "oldest" || v === "episode") return v;
  } catch {
    /* private browsing */
  }
  return "latest";
}

function writeEpisodeSort(v: EpisodeSortKey): void {
  try {
    localStorage.setItem(EPISODE_SORT_KEY, v);
  } catch {
    /* swallow */
  }
}

function readLastSeason(seriesId: string): number | null {
  try {
    const v = localStorage.getItem(`${SEASON_KEY_PREFIX}${seriesId}`);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastSeason(seriesId: string, season: number): void {
  try {
    localStorage.setItem(`${SEASON_KEY_PREFIX}${seriesId}`, String(season));
  } catch {
    /* swallow */
  }
}

/** Build the content_name we store in history (includes series name so
 * /series ResumeHero can label the episode with its series). */
function buildEpisodeTitle(
  seriesName: string,
  seasonNum: number,
  ep: EpisodeInfo,
): string {
  return `${seriesName} · S${seasonNum}E${ep.episodeNumber} · ${ep.title}`;
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

// ─── EpisodeSortButton ───────────────────────────────────────────────────────

function EpisodeSortButton({
  id,
  label,
  isActive,
  onSelect,
}: {
  id: EpisodeSortKey;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: `SERIES_DETAIL_EP_SORT_${id.toUpperCase()}`,
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
        padding: "var(--space-2) var(--space-3)",
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

// ─── EpisodeRow ───────────────────────────────────────────────────────────────

interface EpisodeRowProps {
  episode: EpisodeInfo;
  seriesId: string;
  seriesName: string;
  seasonNumber: number;
  historyItem: HistoryItem | undefined;
  onPlay: (ep: EpisodeInfo, seasonNum: number) => void;
}

// Memoized — with 97+ episodes every un-memoed re-render on D-pad focus change
// registered/re-registered norigin focusables and stalled spatial nav. The
// useCallback on `onPlay` in the parent keeps the reference stable between
// renders so memo actually short-circuits.
const EpisodeRow = memo(function EpisodeRow({
  episode,
  seriesId,
  seriesName,
  seasonNumber,
  historyItem,
  onPlay,
}: EpisodeRowProps) {
  const focusKey = `SERIES_DETAIL_EP_${seriesId}_S${seasonNumber}_${episode.id}`;
  const overflowFocusKey = `EPISODE_OVERFLOW_${seriesId}_S${seasonNumber}_${episode.id}`;

  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey,
    onEnterPress: () => onPlay(episode, seasonNumber),
  });

  const progress = historyItem?.progress_seconds ?? 0;
  const duration = historyItem?.duration_seconds ?? episode.duration ?? 0;
  const isWatched = duration > 0 && progress >= duration * WATCHED_THRESHOLD;
  const isInProgress = progress > 0 && !isWatched;

  const overflowActions = useMemo(
    () => [
      {
        label: "Mark as watched",
        onSelect: () => {
          const dur = duration > 0 ? duration : 1;
          void recordHistory(Number(episode.id), {
            content_type: "series",
            content_name: buildEpisodeTitle(seriesName, seasonNumber, episode),
            ...(episode.icon ? { content_icon: episode.icon } : {}),
            progress_seconds: dur,
            duration_seconds: dur,
          });
        },
      },
      {
        label: "Remove from history",
        onSelect: () => {
          removeHistoryItem(Number(episode.id), "series");
        },
      },
    ],
    [episode, seasonNumber, seriesName, duration],
  );

  return (
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
        transition:
          "background var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        onClick={() => onPlay(episode, seasonNumber)}
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
        {/* Still image */}
        <div
          style={{
            flexShrink: 0,
            width: 160,
            height: 90,
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {episode.icon ? (
            <img
              src={episode.icon}
              alt=""
              loading="lazy"
              decoding="async"
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
          {isInProgress && duration > 0 ? (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: `${Math.min(100, (progress / duration) * 100)}%`,
                height: 3,
                background: "var(--accent-copper)",
              }}
            />
          ) : null}
        </div>

        {/* Info */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "var(--space-2)",
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: isWatched
                  ? "var(--text-secondary)"
                  : "var(--text-primary)",
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
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                fontSize: "var(--text-label-size)",
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {episode.duration !== undefined
                ? formatDuration(episode.duration)
                : null}
              <span aria-hidden="true" style={{ fontSize: 14 }}>
                {isWatched ? "✓" : isInProgress ? "●" : "○"}
              </span>
            </span>
          </div>

          {episode.plot ? (
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
          ) : null}

          {isInProgress && duration > 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginTop: "var(--space-1)",
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-label-size)",
                  color: "var(--accent-copper)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatProgress(progress, duration)}
              </span>
            </div>
          ) : null}
        </div>
      </button>

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
});

// ─── HeroCta ─────────────────────────────────────────────────────────────────

function HeroCta({
  label,
  ariaLabel,
  onPress,
}: {
  label: string;
  ariaLabel: string;
  onPress: () => void;
}) {
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
        minWidth: 220,
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      <span aria-hidden="true">▶</span>
      {label}
    </button>
  );
}

// ─── FavoriteButton ──────────────────────────────────────────────────────────

function FavoriteButton({
  seriesId,
  seriesName,
  seriesIcon,
}: {
  seriesId: string;
  seriesName: string;
  seriesIcon: string | null | undefined;
}) {
  const [favorited, setFavorited] = useState(() =>
    isFavorited(Number(seriesId), "series"),
  );

  const toggle = useCallback(() => {
    if (favorited) {
      void removeFavorite(Number(seriesId), "series");
      setFavorited(false);
    } else {
      void addFavorite(Number(seriesId), {
        content_type: "series",
        content_name: seriesName,
        ...(seriesIcon ? { content_icon: seriesIcon } : {}),
      });
      setFavorited(true);
    }
  }, [favorited, seriesId, seriesName, seriesIcon]);

  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: "SERIES_DETAIL_FAVORITE",
    onEnterPress: toggle,
  });

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      className="focus-ring"
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorited}
      onClick={toggle}
      style={{
        width: 48,
        height: 48,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: focused ? "var(--accent-copper)" : "var(--bg-elevated)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid var(--bg-surface)",
        borderRadius: "var(--radius-sm)",
        color: favorited
          ? "var(--accent-copper)"
          : focused
            ? "var(--bg-base)"
            : "var(--text-primary)",
        fontSize: 22,
        cursor: "pointer",
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      {favorited ? "♥" : "♡"}
    </button>
  );
}

// ─── MarkAllWatchedButton ────────────────────────────────────────────────────

function MarkAllWatchedButton({
  seriesName,
  allEpisodes,
  onDone,
}: {
  seriesName: string;
  allEpisodes: { season: number; ep: EpisodeInfo }[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm(
      `Mark every episode of "${seriesName}" as watched?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await Promise.all(
        allEpisodes.map(({ season, ep }) => {
          const dur = ep.duration ?? 1;
          return recordHistory(Number(ep.id), {
            content_type: "series",
            content_name: buildEpisodeTitle(seriesName, season, ep),
            ...(ep.icon ? { content_icon: ep.icon } : {}),
            progress_seconds: dur,
            duration_seconds: dur,
          });
        }),
      );
    } finally {
      setBusy(false);
      onDone();
    }
  }, [busy, allEpisodes, seriesName, onDone]);

  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: "SERIES_DETAIL_MARK_ALL",
    onEnterPress: run,
  });

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      className="focus-ring"
      aria-label="Mark all episodes watched"
      onClick={run}
      disabled={busy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-4)",
        background: focused ? "var(--accent-copper)" : "var(--bg-elevated)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid var(--bg-surface)",
        borderRadius: "var(--radius-sm)",
        color: focused ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-tracking)",
        textTransform: "uppercase",
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.6 : 1,
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      ✓ Mark all watched
    </button>
  );
}

// ─── SeriesDetailRoute ───────────────────────────────────────────────────────

interface ResumeState {
  seasonNumber: number;
  episodeId: string;
  episodeNumber: number;
  progress: number;
  duration: number;
}

export function SeriesDetailRoute() {
  const { id: seriesId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openPlayer } = usePlayerOpener();
  const playerStatus = usePlayerStore().state.status;

  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_SERIES_DETAIL",
    focusable: false,
    trackChildren: true,
    // Absorb dead-direction bubble-ups at the detail route's outer edges
    // (Left on first episode / first season chip, Right on last, Up on
    // hero). Down stays open so episode rows can still reach BottomDock.
    // Matches PR #85's treatment of CONTENT_AREA_* — see
    // streamvault-v3-focus-vanish-bug.md.
    isFocusBoundary: true,
    focusBoundaryDirections: ["left", "right", "up"],
  });

  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSeasonNumber, setActiveSeasonNumber] = useState<number>(1);
  const [episodeSort, setEpisodeSort] = useState<EpisodeSortKey>(() =>
    readEpisodeSort(),
  );
  // Bumped after "Mark all watched" writes — drives a re-read of history.
  const [historyGeneration, setHistoryGeneration] = useState(0);

  const focusSeeded = useRef(false);

  // ─── Fetch (info + history) ─────────────────────────────────────────────
  useEffect(() => {
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

        // Seed active season: stored pref → in-progress season → first sorted.
        const sorted = sortSeasons(seriesInfo.seasons ?? []);
        const defaultSeason = sorted[0]?.seasonNumber ?? 1;
        const stored = readLastSeason(seriesId);
        if (
          stored !== null &&
          sorted.some((s) => s.seasonNumber === stored)
        ) {
          setActiveSeasonNumber(stored);
        } else {
          const histMap = new Map<string, HistoryItem>();
          for (const h of hist) {
            if (h.content_type === "series") {
              histMap.set(String(h.content_id), h);
            }
          }
          let seededSeason = defaultSeason;
          let latestWatchedAt = 0;
          for (const [seasonKey, eps] of Object.entries(
            seriesInfo.episodes ?? {},
          )) {
            const sn = Number(seasonKey);
            for (const ep of eps) {
              const h = histMap.get(ep.id);
              if (!h) continue;
              const prog = h.progress_seconds;
              const dur = h.duration_seconds || ep.duration || 0;
              const isWatched =
                dur > 0 && prog >= dur * WATCHED_THRESHOLD;
              if (!isWatched && prog > 0) {
                const wa = Date.parse(h.watched_at);
                if (Number.isFinite(wa) && wa > latestWatchedAt) {
                  latestWatchedAt = wa;
                  seededSeason = sn;
                }
              }
            }
          }
          setActiveSeasonNumber(seededSeason);
        }

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
  }, [seriesId, historyGeneration]);

  // ─── Derived ────────────────────────────────────────────────────────────
  const sortedSeasons = useMemo(
    () => sortSeasons(info?.seasons ?? []),
    [info],
  );

  const allEpisodes = useMemo<{ season: number; ep: EpisodeInfo }[]>(() => {
    if (!info?.episodes) return [];
    const out: { season: number; ep: EpisodeInfo }[] = [];
    for (const [seasonKey, eps] of Object.entries(info.episodes)) {
      const sn = Number(seasonKey);
      for (const ep of eps) out.push({ season: sn, ep });
    }
    return out;
  }, [info]);

  const historyByEpId = useMemo<Map<string, HistoryItem>>(() => {
    const m = new Map<string, HistoryItem>();
    for (const h of history) {
      if (h.content_type === "series") m.set(String(h.content_id), h);
    }
    return m;
  }, [history]);

  const { mostRecentEp, mostRecentHist, watchedCount } = useMemo(() => {
    let pickedEp: { season: number; ep: EpisodeInfo } | undefined;
    let pickedHist: HistoryItem | undefined;
    let latestAt = 0;
    let watched = 0;

    for (const { season, ep } of allEpisodes) {
      const h = historyByEpId.get(ep.id);
      if (!h) continue;
      const dur = h.duration_seconds || ep.duration || 0;
      const isWatched = dur > 0 && h.progress_seconds >= dur * WATCHED_THRESHOLD;
      if (isWatched) watched += 1;
      const at = Date.parse(h.watched_at);
      if (Number.isFinite(at) && at > latestAt) {
        latestAt = at;
        pickedEp = { season, ep };
        pickedHist = h;
      }
    }

    return {
      mostRecentEp: pickedEp,
      mostRecentHist: pickedHist,
      watchedCount: watched,
    };
  }, [allEpisodes, historyByEpId]);

  /** Episodes ordered by (season asc, episode asc) for "next episode" walks. */
  const chronoEpisodes = useMemo(() => {
    const out = allEpisodes.slice();
    out.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return a.ep.episodeNumber - b.ep.episodeNumber;
    });
    return out;
  }, [allEpisodes]);

  const resumeState = useMemo<ResumeState | null>(() => {
    if (!mostRecentEp || !mostRecentHist) return null;
    const prog = mostRecentHist.progress_seconds;
    const dur =
      mostRecentHist.duration_seconds || mostRecentEp.ep.duration || 0;
    const isWatched = dur > 0 && prog >= dur * WATCHED_THRESHOLD;
    if (isWatched || prog <= 0) return null;
    return {
      seasonNumber: mostRecentEp.season,
      episodeId: mostRecentEp.ep.id,
      episodeNumber: mostRecentEp.ep.episodeNumber,
      progress: prog,
      duration: dur,
    };
  }, [mostRecentEp, mostRecentHist]);

  const allWatched =
    allEpisodes.length > 0 && watchedCount === allEpisodes.length;

  /** The episode the CTA should play. */
  const ctaTarget = useMemo<{ season: number; ep: EpisodeInfo } | null>(() => {
    if (resumeState) {
      return (
        allEpisodes.find(
          ({ ep }) => ep.id === resumeState.episodeId,
        ) ?? null
      );
    }
    // Mostly-watched episode → walk to the next one
    if (mostRecentEp && mostRecentHist) {
      const dur =
        mostRecentHist.duration_seconds || mostRecentEp.ep.duration || 0;
      const prog = mostRecentHist.progress_seconds;
      if (dur > 0 && prog >= dur * WATCHED_THRESHOLD) {
        const idx = chronoEpisodes.findIndex(
          (x) =>
            x.season === mostRecentEp.season &&
            x.ep.id === mostRecentEp.ep.id,
        );
        if (idx >= 0 && idx + 1 < chronoEpisodes.length) {
          return chronoEpisodes[idx + 1]!;
        }
      }
    }
    // All-watched → rewatch from S1E1 (existing behaviour, gated by allWatched
    // label branch below).
    if (allWatched) return chronoEpisodes[0] ?? null;
    // First visit with no history — for daily-serial / long-running content
    // (the bulk of this library) users expect the latest episode, not the
    // pilot. Default to the final episode in chrono order.
    return chronoEpisodes[chronoEpisodes.length - 1] ?? null;
  }, [
    resumeState,
    mostRecentEp,
    mostRecentHist,
    allEpisodes,
    chronoEpisodes,
    allWatched,
  ]);

  const { ctaLabel, ctaAriaLabel } = useMemo(() => {
    if (resumeState) {
      return {
        ctaLabel: `Continue S${resumeState.seasonNumber}E${resumeState.episodeNumber}  ${formatProgress(resumeState.progress, resumeState.duration)}`,
        ctaAriaLabel: `Continue Season ${resumeState.seasonNumber} Episode ${resumeState.episodeNumber} from ${formatDuration(resumeState.progress)}`,
      };
    }
    if (allWatched) {
      const first = chronoEpisodes[0];
      const s = first?.season ?? 1;
      const e = first?.ep.episodeNumber ?? 1;
      return {
        ctaLabel: `Rewatch S${s}E${e}`,
        ctaAriaLabel: `Rewatch Season ${s} Episode ${e} from the beginning`,
      };
    }
    if (ctaTarget) {
      const s = ctaTarget.season;
      const e = ctaTarget.ep.episodeNumber;
      const isNext = mostRecentEp && mostRecentEp.ep.id !== ctaTarget.ep.id;
      return {
        ctaLabel: isNext
          ? `Play next: S${s}E${e}`
          : `Play S${s}E${e}`,
        ctaAriaLabel: `Play Season ${s} Episode ${e}`,
      };
    }
    return {
      ctaLabel: "Play S1E1",
      ctaAriaLabel: "Play Season 1 Episode 1",
    };
  }, [resumeState, allWatched, ctaTarget, chronoEpisodes, mostRecentEp]);

  useEffect(() => {
    if (!loading && !error && !focusSeeded.current) {
      focusSeeded.current = true;
      const t = setTimeout(() => {
        setFocus("SERIES_DETAIL_PLAY_CTA");
      }, 80);
      return () => clearTimeout(t);
    }
  }, [loading, error]);

  // ─── Play handler ────────────────────────────────────────────────────────
  // playEpisodeAt wires onPrev/onNext so the player's ⏮/⏭ walk within the
  // same season's episode list in the user's current sort order (Phase 6c).
  // Each call passes a new index into the same array, forming a cheap
  // closure chain rather than storing list state in PlayerProvider.
  // Self-reference is routed through a ref to avoid the TDZ that the
  // react-hooks/immutability rule flags on a useCallback that names itself.
  const playEpisodeAtRef = useRef<
    (episodes: EpisodeInfo[], idx: number, seasonNum: number) => void
  >(() => {});
  const playEpisodeAt = useCallback(
    (episodes: EpisodeInfo[], idx: number, seasonNum: number) => {
      const ep = episodes[idx];
      if (!ep || !info) return;
      const title = buildEpisodeTitle(info.name, seasonNum, ep);
      void openPlayer({
        kind: "series-episode",
        id: ep.id,
        title,
        ...(idx > 0 && {
          onPrev: () =>
            playEpisodeAtRef.current(episodes, idx - 1, seasonNum),
        }),
        ...(idx < episodes.length - 1 && {
          onNext: () =>
            playEpisodeAtRef.current(episodes, idx + 1, seasonNum),
        }),
      });
    },
    [info, openPlayer],
  );
  useEffect(() => {
    playEpisodeAtRef.current = playEpisodeAt;
  }, [playEpisodeAt]);

  const playEpisode = useCallback(
    (ep: EpisodeInfo, seasonNum: number) => {
      const seasonKey = String(seasonNum);
      const rawEps = info?.episodes?.[seasonKey] ?? [];
      // Walk within the user's current sort so ⏮/⏭ matches what's on screen.
      const sortedEps = sortEpisodes(rawEps, episodeSort);
      const idx = sortedEps.findIndex((e) => e.id === ep.id);
      playEpisodeAt(sortedEps, Math.max(0, idx), seasonNum);
    },
    [info, episodeSort, playEpisodeAt],
  );

  const handleCtaPress = useCallback(() => {
    if (ctaTarget) playEpisode(ctaTarget.ep, ctaTarget.season);
  }, [ctaTarget, playEpisode]);

  const handleSeasonSelect = useCallback(
    (n: number) => {
      setActiveSeasonNumber(n);
      if (seriesId) writeLastSeason(seriesId, n);
    },
    [seriesId],
  );

  const handleEpisodeSortChange = useCallback((next: EpisodeSortKey) => {
    setEpisodeSort(next);
    writeEpisodeSort(next);
  }, []);

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

  const handleRetry = useCallback(() => {
    if (!seriesId) return;
    setHistoryGeneration((g) => g + 1);
  }, [seriesId]);

  // When the player closes, refetch history so episode in-progress badges
  // and the series-level resume state pick up the position the player just
  // wrote. The player is a global overlay (this route stays mounted while
  // it's open), so without this the episode rows would show stale progress
  // until the user navigates away and back. Series info itself doesn't
  // change while the player is open, so we only refetch history here —
  // not the full series fetch that lives in the effect above.
  useEffect(() => {
    if (playerStatus !== "idle") return;
    let cancelled = false;
    fetchHistory()
      .then((hist) => {
        if (!cancelled) setHistory(hist);
      })
      .catch(() => {
        // silent — history is optional
      });
    return () => {
      cancelled = true;
    };
  }, [playerStatus]);

  const activeEpisodes: EpisodeInfo[] = useMemo(() => {
    const raw = info?.episodes?.[String(activeSeasonNumber)] ?? [];
    return sortEpisodes(raw, episodeSort);
  }, [info, activeSeasonNumber, episodeSort]);

  const activeSeason = sortedSeasons.find(
    (s) => s.seasonNumber === activeSeasonNumber,
  );

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="series-detail"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
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
            <Skeleton width="100%" height={260} />
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
            backLabel="Back to series"
          />
        ) : info ? (
          <>
            {/* ── Backdrop + hero ─────────────────────────────────────── */}
            <div
              style={{
                position: "relative",
                background: info.backdropUrl
                  ? `linear-gradient(180deg, rgba(18,16,14,0.35) 0%, rgba(18,16,14,0.75) 60%, var(--bg-base) 100%), url("${info.backdropUrl.replace(/"/g, '\\"')}")`
                  : "var(--hero-ambient)",
                backgroundSize: info.backdropUrl ? "cover" : "100% 320px",
                backgroundPosition: "center top",
                backgroundRepeat: "no-repeat",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: "var(--space-6)",
                  padding: "var(--space-8) var(--space-6) var(--space-6)",
                  alignItems: "flex-start",
                }}
              >
                {/* Poster */}
                <div
                  style={{
                    flexShrink: 0,
                    width: 180,
                    borderRadius: "var(--radius-sm)",
                    overflow: "hidden",
                    background: "var(--bg-surface)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                  }}
                >
                  {info.icon ? (
                    <img
                      src={info.icon}
                      alt={info.name}
                      decoding="async"
                      style={{ width: "100%", display: "block" }}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      style={{
                        width: 180,
                        height: 270,
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

                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                    minWidth: 0,
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

                  <div
                    style={{
                      display: "flex",
                      gap: "var(--space-3)",
                      color: "var(--text-secondary)",
                      fontSize: "var(--text-label-size)",
                      flexWrap: "wrap",
                    }}
                  >
                    {info.rating ? <span>★ {info.rating}</span> : null}
                    {info.year ? <span>{info.year}</span> : null}
                    {info.genre ? <span>{info.genre}</span> : null}
                    {sortedSeasons.length > 0 ? (
                      <span>
                        {sortedSeasons.length}{" "}
                        {sortedSeasons.length === 1 ? "Season" : "Seasons"}
                      </span>
                    ) : null}
                  </div>

                  {info.plot ? (
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
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      gap: "var(--space-3)",
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginTop: "var(--space-2)",
                    }}
                  >
                    <HeroCta
                      label={ctaLabel}
                      ariaLabel={ctaAriaLabel}
                      onPress={handleCtaPress}
                    />
                    <FavoriteButton
                      seriesId={info.id}
                      seriesName={info.name}
                      seriesIcon={info.icon}
                    />
                    {allEpisodes.length > 0 ? (
                      <MarkAllWatchedButton
                        seriesName={info.name}
                        allEpisodes={allEpisodes}
                        onDone={() => setHistoryGeneration((g) => g + 1)}
                      />
                    ) : null}
                  </div>

                  {resumeState && resumeState.duration > 0 ? (
                    <div
                      style={{
                        width: 220,
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
                  ) : null}
                </div>
              </div>
            </div>

            {/* ── Season rail ───────────────────────────────────────── */}
            {sortedSeasons.length > 0 ? (
              <div
                role="toolbar"
                aria-label="Season selector"
                style={{
                  display: "flex",
                  flexWrap: "nowrap",
                  gap: "var(--space-3)",
                  padding: "var(--space-3) var(--space-6)",
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
                    onSelect={() => handleSeasonSelect(season.seasonNumber)}
                  />
                ))}
              </div>
            ) : null}

            {/* ── Episode sort + title row ─────────────────────────── */}
            {sortedSeasons.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  padding: "var(--space-4) var(--space-6) 0",
                  flexWrap: "wrap",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: "var(--text-label-size)",
                    color: "var(--text-secondary)",
                    letterSpacing: "var(--text-label-tracking)",
                    textTransform: "uppercase",
                  }}
                >
                  {activeSeason ? seasonLabel(activeSeason) : "Episodes"}
                  {activeEpisodes.length > 0 ? (
                    <span
                      style={{
                        marginLeft: "var(--space-3)",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {activeEpisodes.length}{" "}
                      {activeEpisodes.length === 1 ? "episode" : "episodes"}
                    </span>
                  ) : null}
                </h2>

                <div
                  role="group"
                  aria-label="Sort episodes"
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
                  {EPISODE_SORT_OPTIONS.map((opt) => (
                    <EpisodeSortButton
                      key={opt.id}
                      id={opt.id}
                      label={opt.label}
                      isActive={episodeSort === opt.id}
                      onSelect={() => handleEpisodeSortChange(opt.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* ── Episode list ──────────────────────────────────────── */}
            {/* Virtualized via react-virtuoso. At 97+ episodes, the former
                plain .map() mounted every row into the DOM + registered every
                useFocusable with norigin; D-pad arrow presses then re-rendered
                all rows and stalled spatial nav. Virtuoso windows the DOM to
                visible rows, keeping registration cost bounded. */}
            {activeEpisodes.length === 0 ? (
              <div
                style={{
                  padding: "var(--space-6) var(--space-6) var(--space-6)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  color: "var(--text-secondary)",
                }}
              >
                <p style={{ margin: 0, fontSize: "var(--text-body-size)" }}>
                  No episodes in{" "}
                  {activeSeason ? seasonLabel(activeSeason) : "this season"}{" "}
                  yet.
                </p>
              </div>
            ) : (
              <Virtuoso
                data={activeEpisodes}
                style={{
                  height: "70vh",
                  padding: "var(--space-3) var(--space-6) var(--space-6)",
                }}
                overscan={400}
                computeItemKey={(_, ep) => ep.id}
                itemContent={(_, ep) => (
                  <div style={{ paddingBottom: "var(--space-1)" }}>
                    <EpisodeRow
                      episode={ep}
                      seriesId={seriesId ?? ""}
                      seriesName={info.name}
                      seasonNumber={activeSeasonNumber}
                      historyItem={historyByEpId.get(ep.id)}
                      onPlay={playEpisode}
                    />
                  </div>
                )}
              />
            )}
          </>
        ) : null}
      </main>
    </FocusContext.Provider>
  );
}
