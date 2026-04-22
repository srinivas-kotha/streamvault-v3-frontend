/**
 * FavoritesRoute — /favorites screen (Phase 8).
 *
 * Shows all favorited items grouped by type:
 *   1. Live Channels
 *   2. Movies (VOD)
 *   3. Series
 *
 * Each section is a horizontal row of focusable cards. D-pad Left/Right
 * navigates within a row; Up/Down moves between rows. Enter on a card
 * navigates to the content (stub: navigate(-1) back to the source route
 * in Phase 8; deep-link in Phase 9).
 *
 * Dock: accessed via Settings → Favorites. The BottomDock keeps its
 * 5-item shape unchanged. See PR body for rationale.
 */
import type { RefObject } from "react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import { useFavorites } from "../features/favorites/useFavorites";
import { FavoriteToggle } from "../features/favorites/FavoriteToggle";
import { Skeleton } from "../primitives/Skeleton";
import { ErrorShell } from "../primitives/ErrorShell";
import type { FavoriteItem, ContentType } from "../api/schemas";

// ─── Section row ─────────────────────────────────────────────────────────────

function FavoriteCard({
  item,
  onUnfav,
}: {
  item: FavoriteItem;
  onUnfav: (id: number, type: ContentType) => void;
}) {
  const focusKey = `FAV_CARD_${item.content_type.toUpperCase()}_${item.content_id}`;
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => {
      // Phase 8 stub: actual deep-link in Phase 9.
    },
  });

  return (
    <li
      style={{
        listStyle: "none",
        flexShrink: 0,
        width: 160,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <div
        ref={ref as RefObject<HTMLDivElement>}
        tabIndex={-1}
        aria-label={item.content_name ?? "Favorite item"}
        style={{
          background: focused ? "var(--accent-copper)" : "var(--bg-surface)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          minHeight: 100,
          position: "relative",
          transition:
            "background var(--motion-focus), color var(--motion-focus)",
        }}
      >
        {/* Star toggle — focusable sibling inside the card */}
        <div style={{ position: "absolute", top: 6, right: 6 }}>
          <FavoriteToggle
            contentId={item.content_id}
            contentType={item.content_type}
            isFavorited={true}
            onToggle={() => onUnfav(item.content_id, item.content_type)}
            compact
          />
        </div>

        {/* Poster / icon placeholder */}
        <div
          aria-hidden="true"
          style={{
            fontSize: 32,
            lineHeight: 1,
            color: focused
              ? "var(--bg-base)"
              : "var(--text-secondary)",
          }}
        >
          {item.content_type === "channel"
            ? "●"
            : item.content_type === "vod"
              ? "▶"
              : "⊞"}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "var(--text-label-size)",
            letterSpacing: "var(--text-label-tracking)",
            color: focused ? "var(--bg-base)" : "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.content_name ?? `Item ${item.content_id}`}
        </p>
        {item.category_name && (
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-label-size)",
              color: focused ? "var(--bg-base)" : "var(--text-secondary)",
              opacity: 0.8,
            }}
          >
            {item.category_name}
          </p>
        )}
      </div>
    </li>
  );
}

function FavoriteSection({
  title,
  items,
  focusKeyPrefix,
  onUnfav,
}: {
  title: string;
  items: FavoriteItem[];
  focusKeyPrefix: string;
  onUnfav: (id: number, type: ContentType) => void;
}) {
  const { ref, focusKey } = useFocusable({
    focusKey: `FAV_ROW_${focusKeyPrefix}`,
  });

  if (items.length === 0) return null;

  return (
    <FocusContext.Provider value={focusKey}>
      <section aria-label={title} ref={ref as RefObject<HTMLElement>}>
        <h2
          style={{
            fontSize: "var(--text-title-size)",
            color: "var(--text-primary)",
            margin: "0 0 var(--space-3) 0",
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
        <ul
          aria-label={`${title} favorites`}
          style={{
            display: "flex",
            gap: "var(--space-4)",
            overflowX: "auto",
            padding: "var(--space-2) 0",
            margin: 0,
            listStyle: "none",
            // No scroll-snap or backdrop-filter per constraints.
          }}
        >
          {items.map((item) => (
            <FavoriteCard
              key={`${item.content_type}-${item.content_id}`}
              item={item}
              onUnfav={onUnfav}
            />
          ))}
        </ul>
      </section>
    </FocusContext.Provider>
  );
}

// ─── Route ────────────────────────────────────────────────────────────────────

export function FavoritesRoute() {
  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_FAVORITES",
    focusable: false,
    trackChildren: true,
  });
  const navigate = useNavigate();
  const { favorites, loading, error, toggle, reload } = useFavorites();

  const handleUnfav = useCallback(
    async (id: number, type: ContentType) => {
      await toggle(id, type, {});
    },
    [toggle],
  );

  const channels = favorites.filter((f) => f.content_type === "channel");
  const movies = favorites.filter((f) => f.content_type === "vod");
  const series = favorites.filter((f) => f.content_type === "series");
  const isEmpty = channels.length === 0 && movies.length === 0 && series.length === 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="favorites"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
          padding: "var(--space-6)",
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
          My Favorites
        </h1>

        {loading && (
          <div
            aria-busy="true"
            aria-label="Loading favorites"
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
          >
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height="140px" />
            ))}
          </div>
        )}

        {!loading && error && (
          <ErrorShell
            icon="network"
            title="Can't load favorites"
            subtext={error}
            onRetry={() => void reload()}
          />
        )}

        {!loading && !error && isEmpty && (
          <EmptyState />
        )}

        {!loading && !error && !isEmpty && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}
          >
            <FavoriteSection
              title="Live Channels"
              items={channels}
              focusKeyPrefix="CHANNELS"
              onUnfav={handleUnfav}
            />
            <FavoriteSection
              title="Movies"
              items={movies}
              focusKeyPrefix="MOVIES"
              onUnfav={handleUnfav}
            />
            <FavoriteSection
              title="Series"
              items={series}
              focusKeyPrefix="SERIES"
              onUnfav={handleUnfav}
            />
          </div>
        )}
      </main>
    </FocusContext.Provider>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BackButton({ onBack }: { onBack: () => void }) {
  const { ref, focused } = useFocusable({
    focusKey: "FAV_BACK_BTN",
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
      aria-label="No favorites yet"
      style={{
        textAlign: "center",
        padding: "var(--space-12) var(--space-6)",
        color: "var(--text-secondary)",
      }}
    >
      <p style={{ fontSize: 48, margin: "0 0 var(--space-4) 0" }}>☆</p>
      <p style={{ fontSize: "var(--text-title-size)", margin: 0 }}>
        No favorites yet
      </p>
      <p
        style={{
          fontSize: "var(--text-body-size)",
          marginTop: "var(--space-2)",
          opacity: 0.7,
        }}
      >
        Press the ★ on any channel, movie, or series to save it here.
      </p>
    </div>
  );
}
