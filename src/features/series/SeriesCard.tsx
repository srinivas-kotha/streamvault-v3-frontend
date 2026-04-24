/**
 * SeriesCard — 2:3 poster card for /series, with focus + overflow menu.
 *
 * Spec: docs/ux/02-series.md §2.1 (card states) + §2.2 (⋯ overflow).
 *
 * Enter = navigate to /series/:id (NEVER openPlayer — the "series buffers
 * forever" bug the spec calls out). Play lives on the detail page.
 *
 * ⋯ overflow is visible only while the card is focused. Actions: toggle
 * favorite, "Mark series as watched" (bulk via detail fetch + confirm).
 */
import type { RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { OverflowMenu } from "../../components/OverflowMenu";
import {
  addFavorite,
  removeFavorite,
  isFavorited,
} from "../../api/favorites";
import { recordHistory } from "../../api/history";
import { fetchSeriesInfo } from "../../api/series";
import type { SeriesItem } from "../../api/schemas";

export interface SeriesCardProgress {
  progressSeconds: number;
  durationSeconds: number;
}

export interface SeriesCardProps {
  item: SeriesItem;
  /** Called on Enter / click — navigates to /series/:id. */
  onClick: (id: string) => void;
  /** Progress on the most-recently-watched episode, if any. */
  progress?: SeriesCardProgress;
  /** "S2E4" label for the bottom-right badge when history exists. */
  sEpLabel?: string;
  /** True when `item.added` is within the last 14 days (NEW pill). */
  isNew?: boolean;
}

function NewPill() {
  return (
    <span
      aria-label="Recently added"
      style={{
        position: "absolute",
        top: "var(--space-2)",
        left: "var(--space-2)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-pill)",
        background: "var(--accent-copper)",
        color: "var(--bg-base)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        lineHeight: 1.3,
        textTransform: "uppercase",
        pointerEvents: "none",
      }}
    >
      NEW
    </span>
  );
}

function SEpBadge({ label }: { label: string }) {
  return (
    <span
      aria-label={`Last watched ${label}`}
      style={{
        position: "absolute",
        bottom: "var(--space-2)",
        right: "var(--space-2)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-sm)",
        background: "rgba(18, 16, 14, 0.85)",
        color: "var(--accent-copper)",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.3,
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "none",
      }}
    >
      {label}
    </span>
  );
}

export function SeriesCard({
  item,
  onClick,
  progress,
  sEpLabel,
  isNew = false,
}: SeriesCardProps) {
  const { ref, focused } = useFocusable({
    focusKey: `SERIES_CARD_${item.id}`,
    onEnterPress: () => onClick(item.id),
  });

  const [favorited, setFavorited] = useState(() =>
    isFavorited(Number(item.id), "series"),
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sv_favorites") {
        setFavorited(isFavorited(Number(item.id), "series"));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [item.id]);

  const overflowActions = useMemo(
    () => [
      favorited
        ? {
            label: "Remove from favorites",
            onSelect: () => {
              void removeFavorite(Number(item.id), "series");
              setFavorited(false);
            },
          }
        : {
            label: "Add to favorites",
            onSelect: () => {
              void addFavorite(Number(item.id), {
                content_type: "series",
                content_name: item.name,
                ...(item.icon ? { content_icon: item.icon } : {}),
              });
              setFavorited(true);
            },
          },
      {
        label: "Mark series as watched",
        onSelect: async () => {
          const ok = window.confirm(
            `Mark every episode of "${item.name}" as watched?`,
          );
          if (!ok) return;
          try {
            const info = await fetchSeriesInfo(item.id);
            const writes: Promise<void>[] = [];
            for (const [seasonKey, eps] of Object.entries(
              info.episodes ?? {},
            )) {
              const sn = Number(seasonKey);
              for (const ep of eps) {
                const dur = ep.duration ?? 1;
                writes.push(
                  recordHistory(Number(ep.id), {
                    content_type: "series",
                    content_name: `${info.name} · S${sn}E${ep.episodeNumber} · ${ep.title}`,
                    ...(ep.icon ? { content_icon: ep.icon } : {}),
                    progress_seconds: dur,
                    duration_seconds: dur,
                  }),
                );
              }
            }
            await Promise.all(writes);
          } catch {
            // Silent — partial writes are OK (user can re-try)
          }
        },
      },
    ],
    [favorited, item.id, item.name, item.icon],
  );

  const progressPct =
    progress && progress.durationSeconds > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (progress.progressSeconds / progress.durationSeconds) * 100,
          ),
        )
      : 0;

  return (
    <div
      data-card-focusable
      style={{
        position: "relative",
        transform: focused ? "scale(1.03)" : "scale(1)",
        transition: "transform var(--motion-focus)",
      }}
    >
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        aria-label={item.name}
        onClick={() => onClick(item.id)}
        data-testid="series-card"
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
          borderRadius: "var(--radius-sm)",
          padding: 0,
          cursor: "pointer",
          boxShadow: focused
            ? "var(--focus-ring-shadow)"
            : "0 2px 6px rgba(0,0,0,0.2)",
          transition:
            "box-shadow var(--motion-focus), border-color var(--motion-focus)",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: "100%",
            aspectRatio: "2 / 3",
            background: "var(--bg-elevated, var(--bg-surface))",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {item.icon ? (
            <img
              src={item.icon}
              alt=""
              loading="lazy"
              decoding="async"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2rem",
                color: "var(--text-secondary)",
                opacity: 0.4,
              }}
            >
              ⊞
            </span>
          )}

          {isNew ? <NewPill /> : null}
          {sEpLabel ? <SEpBadge label={sEpLabel} /> : null}

          {progressPct > 0 ? (
            <div
              aria-hidden="true"
              data-testid="series-progress-bar"
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

        <span
          style={{
            padding: "var(--space-2) var(--space-3)",
            paddingRight: focused
              ? "calc(var(--space-3) + 40px)"
              : "var(--space-3)",
            fontSize: "var(--text-label-size)",
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
            boxSizing: "border-box",
            transition: "padding-right var(--motion-focus)",
          }}
        >
          {item.name}
        </span>

        {(item.year ?? item.rating) ? (
          <span
            style={{
              padding: "0 var(--space-3) var(--space-2)",
              fontSize: "var(--text-caption-size)",
              color: "var(--text-secondary)",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {[item.year, item.rating && `★ ${item.rating}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </button>

      {focused ? (
        <div
          style={{
            position: "absolute",
            bottom: "var(--space-2)",
            right: "var(--space-2)",
            zIndex: 10,
          }}
        >
          <OverflowMenu
            focusKey={`SERIES_OVERFLOW_${item.id}`}
            actions={overflowActions}
            triggerLabel={`More actions for ${item.name}`}
            placement="below"
          />
        </div>
      ) : null}
    </div>
  );
}
