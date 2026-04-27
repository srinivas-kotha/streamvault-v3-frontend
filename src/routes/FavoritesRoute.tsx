/**
 * FavoritesRoute — /favorites screen.
 *
 * Rebuilt 2026-04-24 per UX-lead spec (search-favorites session):
 *   - Three horizontal rails: Live Channels · Movies · Series
 *   - Cards are 2:3 FavoritePosterCard (visual parity with MovieCard/SeriesCard)
 *   - Per-card activation: Live → player, VOD → player, Series → /series/:id
 *   - Per-card OverflowMenu (Play / More info for VOD / Remove from favorites)
 *   - Sort toolbar (Recently added · Alphabetical), persisted
 *   - Per-section empty states (only a whole-page empty if ALL sections empty)
 *
 * Layout note: no LanguageRail. Favorites are cross-language by design.
 *
 * MUST PRESERVE: CONTENT_AREA_FAVORITES focus key + FocusContext — load-bearing
 * for BottomDock's setFocus("CONTENT_AREA_FAVORITES") on Esc routing.
 */
import type { RefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { useFavorites } from "../features/favorites/useFavorites";
import { FavoritePosterCard } from "../features/favorites/FavoritePosterCard";
import { ConfirmDeleteAllModal } from "../features/favorites/ConfirmDeleteAllModal";
import { FavoritesUndoToast } from "../features/favorites/FavoritesUndoToast";
import { MovieDetailSheet } from "../features/movies/MovieDetailSheet";
import { usePlayerOpener } from "../player";
import {
  getFavoriteSortPref,
  setFavoriteSortPref,
  sortFavorites,
  type FavoriteSortKey,
} from "../features/favorites/sortFavorites";
import { Skeleton } from "../primitives/Skeleton";
import { ErrorShell } from "../primitives/ErrorShell";
import { logEvent } from "../telemetry";
import type { FavoriteItem, ContentType, VodStream } from "../api/schemas";

const SORT_OPTIONS: { id: FavoriteSortKey; label: string }[] = [
  { id: "added", label: "Recently added" },
  { id: "name", label: "A–Z" },
];

interface SortButtonProps {
  id: FavoriteSortKey;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}

function SortButton({ id, label, isActive, onSelect }: SortButtonProps) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: `FAV_SORT_${id.toUpperCase()}`,
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

function FavoriteSection({
  title,
  items,
  focusKeyPrefix,
  emptyLabel,
  onRemove,
  onMoreInfo,
}: {
  title: string;
  items: FavoriteItem[];
  focusKeyPrefix: string;
  emptyLabel: string;
  onRemove: (id: number, type: ContentType) => void;
  onMoreInfo?: (item: FavoriteItem) => void;
}) {
  const { ref, focusKey } = useFocusable({
    focusKey: `FAV_ROW_${focusKeyPrefix}`,
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <section
        aria-label={title}
        ref={ref as RefObject<HTMLElement>}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        <h2
          style={{
            fontSize: "var(--text-title-size)",
            color: "var(--text-primary)",
            margin: 0,
            fontWeight: 600,
          }}
        >
          {title}
          <span
            style={{
              marginLeft: "var(--space-3)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-label-size)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {items.length}
          </span>
        </h2>
        {items.length === 0 ? (
          <p
            role="status"
            style={{
              margin: 0,
              padding: "var(--space-4)",
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-body-size)",
            }}
          >
            {emptyLabel}
          </p>
        ) : (
          <ul
            aria-label={`${title} favorites`}
            style={{
              display: "flex",
              gap: "var(--space-4)",
              overflowX: "auto",
              padding: "var(--space-2) 0",
              margin: 0,
              listStyle: "none",
            }}
          >
            {items.map((item) => (
              <li
                key={`${item.content_type}-${item.content_id}`}
                style={{ listStyle: "none", flexShrink: 0, width: 160 }}
              >
                <FavoritePosterCard
                  item={item}
                  onRemove={onRemove}
                  {...(onMoreInfo ? { onMoreInfo } : {})}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </FocusContext.Provider>
  );
}

export function FavoritesRoute() {
  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_FAVORITES",
    focusable: false,
    trackChildren: true,
    isFocusBoundary: true,
    focusBoundaryDirections: ["left", "right", "up"],
  });

  const { favorites, loading, error, toggle, reload, clearAll, restoreAll } =
    useFavorites();
  const { openPlayer } = usePlayerOpener();
  const [sort, setSort] = useState<FavoriteSortKey>(() => getFavoriteSortPref());
  const [sheetItem, setSheetItem] = useState<FavoriteItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<FavoriteItem[] | null>(null);
  const deleteAtRef = useRef<number>(0);

  const handleRemove = useCallback(
    async (id: number, type: ContentType) => {
      await toggle(id, type, {});
    },
    [toggle],
  );

  const handleSortChange = useCallback((next: FavoriteSortKey) => {
    setSort(next);
    setFavoriteSortPref(next);
  }, []);

  const handleMoreInfo = useCallback((item: FavoriteItem) => {
    if (item.content_type !== "vod") return;
    setSheetItem(item);
  }, []);

  const handleDeleteAllTrigger = useCallback(() => {
    logEvent("favorites_delete_all_triggered", { count: favorites.length });
    setConfirmOpen(true);
  }, [favorites.length]);

  const handleConfirmDelete = useCallback(async () => {
    const count = favorites.length;
    logEvent("favorites_delete_all_confirmed", { count });
    setConfirmOpen(false);
    deleteAtRef.current = Date.now();
    const snapshot = await clearAll();
    setUndoSnapshot(snapshot);
    setFocus("FAV_UNDO_TOAST");
  }, [favorites.length, clearAll]);

  const handleCancelDelete = useCallback((trigger: "button" | "back") => {
    logEvent("favorites_delete_all_cancelled", { trigger });
    setConfirmOpen(false);
    setFocus("FAV_DELETE_ALL_TRIGGER");
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoSnapshot) return;
    const elapsed = Date.now() - deleteAtRef.current;
    logEvent("favorites_delete_all_undone", {
      count: undoSnapshot.length,
      elapsed_ms: elapsed,
    });
    await restoreAll(undoSnapshot);
    setUndoSnapshot(null);
    setFocus("FAV_DELETE_ALL_TRIGGER");
  }, [undoSnapshot, restoreAll]);

  const handleUndoExpire = useCallback(() => {
    if (!undoSnapshot) return;
    logEvent("favorites_delete_all_committed", { count: undoSnapshot.length });
    setUndoSnapshot(null);
    setFocus("CONTENT_AREA_FAVORITES");
  }, [undoSnapshot]);

  const { channels, movies, series } = useMemo(() => {
    const sorted = sortFavorites(favorites, sort);
    return {
      channels: sorted.filter((f) => f.content_type === "channel"),
      movies: sorted.filter((f) => f.content_type === "vod"),
      series: sorted.filter((f) => f.content_type === "series"),
    };
  }, [favorites, sort]);

  const isEmpty =
    channels.length === 0 && movies.length === 0 && series.length === 0;

  // Adapt a favorite VOD into the VodStream shape MovieDetailSheet expects.
  // We only need id + name + icon; everything else is optional on VodStream.
  const sheetStream: VodStream | null = useMemo(() => {
    if (!sheetItem) return null;
    return {
      id: String(sheetItem.content_id),
      name: sheetItem.content_name ?? `Item ${sheetItem.content_id}`,
      type: "vod",
      categoryId: "",
      ...(sheetItem.content_icon ? { icon: sheetItem.content_icon } : {}),
    } as VodStream;
  }, [sheetItem]);

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="favorites"
        tabIndex={-1}
        style={{
          paddingBottom:
            "var(--dock-content-reserve, calc(var(--dock-height) + var(--space-6) + var(--space-6)))",
          padding: "var(--space-6)",
        }}
      >
        <h1
          style={{
            fontSize: "var(--text-title-size)",
            color: "var(--text-primary)",
            margin: "0 0 var(--space-4) 0",
            fontWeight: 700,
          }}
        >
          My Favorites
        </h1>

        {!loading && !error && !isEmpty && (
          <div
            role="toolbar"
            aria-label="Favorites sort"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) 0 var(--space-4)",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-tracking)",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                marginRight: "var(--space-2)",
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
            <span style={{ flex: 1 }} />
            <DeleteAllTrigger onSelect={handleDeleteAllTrigger} />
          </div>
        )}

        {loading && (
          <div
            aria-busy="true"
            aria-label="Loading favorites"
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
          >
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height="220px" />
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

        {!loading && !error && isEmpty && <WholePageEmpty />}

        {!loading && !error && !isEmpty && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-8)",
            }}
          >
            <FavoriteSection
              title="Live Channels"
              items={channels}
              focusKeyPrefix="CHANNELS"
              emptyLabel="No favorite channels yet. Press ⋯ → Add to favorites on any channel."
              onRemove={handleRemove}
            />
            <FavoriteSection
              title="Movies"
              items={movies}
              focusKeyPrefix="MOVIES"
              emptyLabel="No favorite movies yet. Press ⋯ → Add to favorites on any movie."
              onRemove={handleRemove}
              onMoreInfo={handleMoreInfo}
            />
            <FavoriteSection
              title="Series"
              items={series}
              focusKeyPrefix="SERIES"
              emptyLabel="No favorite series yet. Press ⋯ → Add to favorites on any series."
              onRemove={handleRemove}
            />
          </div>
        )}

        {sheetStream ? (
          <MovieDetailSheet
            key={sheetStream.id}
            stream={sheetStream}
            onClose={() => setSheetItem(null)}
            onPlay={(s) => {
              void openPlayer({ kind: "vod", id: s.id, title: s.name });
              setSheetItem(null);
            }}
          />
        ) : null}

        {confirmOpen && (
          <ConfirmDeleteAllModal
            count={favorites.length}
            onConfirm={() => void handleConfirmDelete()}
            onCancel={handleCancelDelete}
          />
        )}

        {undoSnapshot !== null && (
          <FavoritesUndoToast
            onUndo={() => void handleUndo()}
            onExpire={handleUndoExpire}
          />
        )}
      </main>
    </FocusContext.Provider>
  );
}

function DeleteAllTrigger({ onSelect }: { onSelect: () => void }) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: "FAV_DELETE_ALL_TRIGGER",
    onEnterPress: onSelect,
  });
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      onClick={onSelect}
      className="focus-ring"
      style={{
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--radius-sm)",
        border: focused ? "1px solid var(--accent-copper)" : "1px solid transparent",
        background: "transparent",
        color: focused ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-tracking)",
        textTransform: "uppercase",
        cursor: "pointer",
        transition:
          "color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      Delete all
    </button>
  );
}

function WholePageEmpty() {
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
        Focus any card and press ⋯ → Add to favorites.
      </p>
    </div>
  );
}
