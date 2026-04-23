/**
 * MovieCard — 2:3 poster card for the VOD grid with all 5 states:
 *   idle / focused / in-progress / watched / tier-locked
 *
 * Spec: docs/ux/03-movies.md §6 (card states) + §6.1 (⋯ overflow).
 *
 * Focus: useFocusable(VOD_CARD_<id>). Enter = play directly (no detail route;
 * detail is reached via ⋯ → More info, which opens a bottom sheet).
 *
 * ⋯ overflow: visible only while the card is focused. Actions depend on
 * current favorite state (Add → Remove toggle tracked in local state).
 * "Mark as watched" writes progress/duration = 1/1 so the server's
 * progress/duration threshold flips the card to the watched state on next
 * render — the real duration isn't available on /api/vod/streams (it lives
 * on /api/vod/info/:id only).
 */
import type { RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { OverflowMenu } from "../../components/OverflowMenu";
import { TierLockBadge } from "../../primitives/TierLockBadge";
import {
  addFavorite,
  removeFavorite,
  isFavorited,
} from "../../api/favorites";
import { recordHistory } from "../../api/history";
import type { VodStream } from "../../api/schemas";

export interface MovieCardProgress {
  /** Seconds watched — used to render the progress bar width. */
  progressSeconds: number;
  /** Total seconds — used as the divisor; 0 hides the progress bar. */
  durationSeconds: number;
}

export interface MovieCardProps {
  stream: VodStream;
  /** Called on Enter / click — plays the movie directly. */
  onSelect: (stream: VodStream) => void;
  /** Called when the user picks "More info" from the ⋯ menu. */
  onMoreInfo: (stream: VodStream) => void;
  /** Progress ratio if the user has a partial watch; undefined otherwise. */
  progress?: MovieCardProgress;
  /** True when the item is fully watched (≥90% or explicitly marked). */
  watched?: boolean;
  /** True when the item's container is known not to be allowed on this plan. */
  tierLocked?: boolean;
}

function WatchedBadge() {
  return (
    <span
      role="img"
      aria-label="Watched"
      title="Watched"
      style={{
        position: "absolute",
        top: "var(--space-2)",
        right: "var(--space-2)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: "var(--radius-sm)",
        background: "rgba(18, 16, 14, 0.85)",
        color: "var(--accent-copper)",
        fontSize: 16,
        lineHeight: 1,
        pointerEvents: "none",
      }}
      data-testid="watched-badge"
    >
      ✓
    </span>
  );
}

export function MovieCard({
  stream,
  onSelect,
  onMoreInfo,
  progress,
  watched = false,
  tierLocked = false,
}: MovieCardProps) {
  const { ref, focused } = useFocusable({
    focusKey: `VOD_CARD_${stream.id}`,
    onEnterPress: () => onSelect(stream),
  });

  // Track favorite state so the ⋯ menu can toggle Add ↔ Remove without a
  // round-trip to the server. isFavorited() reads localStorage synchronously
  // so initial state is reliable even after a page reload.
  const [favorited, setFavorited] = useState(() =>
    isFavorited(Number(stream.id), "vod"),
  );

  // Cross-card sync: when another card toggles this movie's favorite status
  // we refresh our read. Kept simple via the window `storage` event — fired
  // only by writes from *other* tabs, so same-tab updates are covered by the
  // local setFavorited() calls below.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sv_favorites") {
        setFavorited(isFavorited(Number(stream.id), "vod"));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [stream.id]);

  const overflowActions = useMemo(
    () => [
      favorited
        ? {
            label: "Remove from favorites",
            onSelect: () => {
              void removeFavorite(Number(stream.id), "vod");
              setFavorited(false);
            },
          }
        : {
            label: "Add to favorites",
            onSelect: () => {
              void addFavorite(Number(stream.id), {
                content_type: "vod",
                content_name: stream.name,
                ...(stream.icon ? { content_icon: stream.icon } : {}),
              });
              setFavorited(true);
            },
          },
      {
        label: "Mark as watched",
        onSelect: () => {
          // Real duration lives on /api/vod/info only. Synthetic 1/1 marks the
          // item with progress_seconds/duration_seconds = 100% so the ≥0.9
          // threshold classifies it as watched on next render.
          void recordHistory(Number(stream.id), {
            content_type: "vod",
            content_name: stream.name,
            ...(stream.icon ? { content_icon: stream.icon } : {}),
            progress_seconds: 1,
            duration_seconds: 1,
          });
        },
      },
      {
        label: "More info",
        onSelect: () => onMoreInfo(stream),
      },
    ],
    [favorited, stream, onMoreInfo],
  );

  const progressPct =
    progress && progress.durationSeconds > 0
      ? Math.max(
          0,
          Math.min(100, (progress.progressSeconds / progress.durationSeconds) * 100),
        )
      : 0;

  return (
    <div
      style={{
        position: "relative",
        transform: focused ? "scale(1.03)" : "scale(1)",
        transition: "transform 150ms ease-out",
      }}
    >
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        aria-label={
          progress && progress.durationSeconds > 0
            ? `${stream.name}, resume at ${Math.floor(progress.progressSeconds / 60)} min`
            : stream.name
        }
        onClick={() => onSelect(stream)}
        className="focus-ring"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          background: "var(--card-glass-bg, var(--bg-surface))",
          border: focused
            ? "1px solid var(--accent-copper)"
            : "var(--card-glass-border, 1px solid rgba(237,228,211,0.06))",
          borderRadius: "var(--radius-sm, 6px)",
          padding: 0,
          cursor: "pointer",
          boxShadow: focused
            ? "var(--focus-glow, 0 0 0 2px var(--accent-copper), 0 8px 32px -8px rgba(200,121,65,0.45))"
            : "0 2px 8px rgba(0,0,0,0.3)",
          transition:
            "box-shadow 150ms ease-out, border-color 150ms ease-out",
          overflow: "hidden",
          textAlign: "left",
          opacity: watched ? 0.6 : 1,
        }}
      >
        <div
          style={{
            width: "100%",
            paddingBottom: "150%",
            position: "relative",
            background: "var(--bg-elevated, #2a2520)",
          }}
        >
          {stream.icon ? (
            <img
              src={stream.icon}
              alt=""
              loading="lazy"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={(e) => {
                // Show fallback when Xtream returns a broken/404 icon URL.
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = "none";
                const sibling = img.nextElementSibling as HTMLElement | null;
                if (sibling?.dataset.role === "poster-fallback") {
                  sibling.style.display = "flex";
                }
              }}
            />
          ) : null}
          <div
            data-role="poster-fallback"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: stream.icon ? "none" : "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "var(--space-3)",
              background:
                "linear-gradient(135deg, var(--bg-elevated, #2a2520) 0%, var(--bg-surface, #1e1a16) 100%)",
              color: "var(--text-tertiary)",
              textAlign: "center",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                fontSize: "clamp(28px, 4vh, 48px)",
                lineHeight: 1,
                opacity: 0.45,
                letterSpacing: "-0.08em",
                color: "var(--accent-copper-dim)",
              }}
            >
              {"▶"}
            </span>
            <span
              style={{
                fontSize: "var(--text-caption-size, 14px)",
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                maxWidth: "100%",
              }}
            >
              {stream.name}
            </span>
          </div>

          {watched ? <WatchedBadge /> : null}
          {tierLocked && !watched ? (
            <TierLockBadge label="Not available on your plan" />
          ) : null}

          {progressPct > 0 && !watched ? (
            <div
              aria-hidden="true"
              data-testid="movie-progress-bar"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: `${progressPct}%`,
                height: 3,
                background: "var(--accent-copper)",
              }}
            />
          ) : null}
        </div>

        <div
          style={{
            padding: "var(--space-1) var(--space-2)",
            paddingRight: focused
              ? "calc(var(--space-2) + 32px)"
              : "var(--space-2)",
            color: "var(--text-primary)",
            fontSize: "var(--text-label-size)",
            letterSpacing: "var(--text-label-tracking)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            transition: "padding-right 150ms ease-out",
          }}
        >
          {stream.name}
        </div>

        {(stream.year ?? stream.rating) && (
          <div
            style={{
              padding: "0 var(--space-2) var(--space-1)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-caption-size)",
              fontVariantNumeric: "tabular-nums",
              display: "flex",
              gap: "var(--space-2)",
            }}
          >
            {stream.year && <span>{stream.year}</span>}
            {stream.rating && <span>★ {stream.rating}</span>}
          </div>
        )}
      </button>

      {focused && (
        <div
          style={{
            position: "absolute",
            bottom: "var(--space-2)",
            right: "var(--space-2)",
            zIndex: 10,
          }}
        >
          <OverflowMenu
            focusKey={`MOVIE_OVERFLOW_${stream.id}`}
            actions={overflowActions}
            triggerLabel={`More actions for ${stream.name}`}
            placement="below"
          />
        </div>
      )}
    </div>
  );
}
