/**
 * HistoryRoute — /history screen (Phase 8).
 *
 * Shows the last 50 watched items, sorted by most-recent first.
 * Each row shows: icon | title | type badge | "watched X hrs ago" | progress bar.
 *
 * Accessible from Settings → Watch History.
 */
import type { RefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import { useWatchHistory } from "../features/history/useWatchHistory";
import { timeAgo } from "../api/history";
import { Skeleton } from "../primitives/Skeleton";
import { ErrorShell } from "../primitives/ErrorShell";
import type { HistoryItem, ContentType } from "../api/schemas";

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({
  item,
  onRemove,
}: {
  item: HistoryItem;
  onRemove: (id: number, type: ContentType) => void;
}) {
  const focusKey = `HISTORY_ROW_${item.content_type.toUpperCase()}_${item.content_id}`;
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => {
      // Phase 8 stub: deep-link to player in Phase 9.
    },
  });

  const progressPct =
    item.duration_seconds > 0
      ? Math.min(100, Math.round((item.progress_seconds / item.duration_seconds) * 100))
      : 0;

  const typeLabel =
    item.content_type === "channel"
      ? "Live"
      : item.content_type === "vod"
        ? "Movie"
        : "Series";

  const typeIcon =
    item.content_type === "channel"
      ? "●"
      : item.content_type === "vod"
        ? "▶"
        : "⊞";

  return (
    <li
      style={{ listStyle: "none", margin: 0, padding: 0 }}
    >
      <div
        ref={ref as RefObject<HTMLDivElement>}
        tabIndex={-1}
        aria-label={`${item.content_name ?? "Unknown"}, ${typeLabel}, watched ${timeAgo(item.watched_at)}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          padding: "var(--space-4)",
          background: focused ? "var(--accent-copper)" : "var(--bg-surface)",
          borderRadius: "var(--radius-sm)",
          transition:
            "background var(--motion-focus), color var(--motion-focus)",
          cursor: "pointer",
          position: "relative",
        }}
      >
        {/* Icon */}
        <span
          aria-hidden="true"
          style={{
            fontSize: 24,
            minWidth: 32,
            textAlign: "center",
            color: focused ? "var(--bg-base)" : "var(--text-secondary)",
          }}
        >
          {typeIcon}
        </span>

        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-body-size)",
              fontWeight: 600,
              color: focused ? "var(--bg-base)" : "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.content_name ?? `Item ${item.content_id}`}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-label-size)",
              color: focused ? "var(--bg-base)" : "var(--text-secondary)",
              opacity: 0.8,
              display: "flex",
              gap: "var(--space-3)",
            }}
          >
            <span>{typeLabel}</span>
            <span aria-label={`Watched ${timeAgo(item.watched_at)}`}>
              {timeAgo(item.watched_at)}
            </span>
          </p>

          {/* Progress bar */}
          {progressPct > 0 && (
            <div
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${progressPct}% watched`}
              style={{
                marginTop: "var(--space-1)",
                height: 3,
                background: focused
                  ? "rgba(255,255,255,0.3)"
                  : "var(--bg-elevated)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPct}%`,
                  height: "100%",
                  background: focused ? "var(--bg-base)" : "var(--accent-copper)",
                }}
              />
            </div>
          )}
        </div>

        {/* Remove button */}
        <RemoveButton
          onClick={() => onRemove(item.content_id, item.content_type)}
          parentFocused={focused}
          stableKey={`${item.content_type}_${item.content_id}`}
        />
      </div>
    </li>
  );
}

function RemoveButton({
  onClick,
  parentFocused,
  stableKey,
}: {
  onClick: () => void;
  parentFocused: boolean;
  stableKey: string;
}) {
  const { ref, focused } = useFocusable({
    focusKey: `HISTORY_REMOVE_${stableKey}`,
    onEnterPress: onClick,
  });
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-label="Remove from history"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="focus-ring"
      style={{
        background: focused ? "var(--bg-base)" : "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        padding: "var(--space-1) var(--space-2)",
        fontSize: 16,
        color:
          focused
            ? "var(--accent-copper)"
            : parentFocused
              ? "var(--bg-base)"
              : "var(--text-tertiary, var(--text-secondary))",
        opacity: 0.7,
        transition: "color var(--motion-focus), background var(--motion-focus)",
        flexShrink: 0,
      }}
    >
      ✕
    </button>
  );
}

// ─── Route ────────────────────────────────────────────────────────────────────

export function HistoryRoute() {
  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_HISTORY",
    focusable: false,
    trackChildren: true,
    // Absorb dead-direction bubble-ups at the route's outer edges; Down
    // stays open so rows can still reach BottomDock. See
    // streamvault-v3-focus-vanish-bug.md.
    isFocusBoundary: true,
    focusBoundaryDirections: ["left", "right", "up"],
  });
  const navigate = useNavigate();
  const { history, loading, error, remove, reload } = useWatchHistory();

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="history"
        tabIndex={-1}
        style={{
          padding: "var(--space-6)",
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
        }}
      >
        {/* Back button */}
        <BackButton onBack={() => navigate(-1)} />

        <h1
          style={{
            fontSize: "var(--text-title-size)",
            color: "var(--text-primary)",
            margin: "0 0 var(--space-6) 0",
            fontWeight: 700,
          }}
        >
          Watch History
        </h1>

        {loading && (
          <div
            aria-busy="true"
            aria-label="Loading history"
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} width="100%" height="72px" />
            ))}
          </div>
        )}

        {!loading && error && (
          <ErrorShell
            icon="network"
            title="Can't load watch history"
            subtext={error}
            onRetry={() => void reload()}
          />
        )}

        {!loading && !error && history.length === 0 && <EmptyState />}

        {!loading && !error && history.length > 0 && (
          <ul
            aria-label="Watch history"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              margin: 0,
              padding: 0,
            }}
          >
            {history.map((item) => (
              <HistoryRow
                key={`${item.content_type}-${item.content_id}`}
                item={item}
                onRemove={remove}
              />
            ))}
          </ul>
        )}
      </main>
    </FocusContext.Provider>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  const { ref, focused } = useFocusable({
    focusKey: "HISTORY_BACK_BTN",
    onEnterPress: onBack,
  });
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      onClick={onBack}
      className="focus-ring"
      aria-label="Go back"
      style={{
        background: focused ? "var(--accent-copper)" : "var(--bg-surface)",
        color: focused ? "var(--bg-base)" : "var(--text-secondary)",
        border: "none",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-2) var(--space-4)",
        cursor: "pointer",
        fontSize: "var(--text-label-size)",
        marginBottom: "var(--space-4)",
        transition: "background var(--motion-focus), color var(--motion-focus)",
      }}
    >
      ← Back
    </button>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      aria-label="No watch history"
      style={{
        textAlign: "center",
        padding: "var(--space-12) var(--space-6)",
        color: "var(--text-secondary)",
      }}
    >
      <p style={{ fontSize: 48, margin: "0 0 var(--space-4) 0" }}>▶</p>
      <p style={{ fontSize: "var(--text-title-size)", margin: 0 }}>
        Nothing watched yet
      </p>
      <p
        style={{
          fontSize: "var(--text-body-size)",
          marginTop: "var(--space-2)",
          opacity: 0.7,
        }}
      >
        Your recently watched channels, movies, and series will appear here.
      </p>
    </div>
  );
}
