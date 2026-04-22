/**
 * useFavorites — optimistic favorites state hook (Phase 8).
 *
 * Loads from the API (+ localStorage fallback) on mount.
 * toggle() performs an optimistic update immediately and rolls back on failure.
 *
 * Exported singleton-like pattern: multiple consumers of the hook on the same
 * page read the same localStorage state. A full Zustand/context store would be
 * overkill for Phase 8; localStorage is the source of truth between renders.
 */
import { useState, useEffect, useCallback } from "react";
import {
  fetchFavorites,
  addFavorite,
  removeFavorite,
  isFavorited,
} from "../../api/favorites";
import type { FavoriteItem, AddFavoriteBody, ContentType } from "../../api/schemas";

export interface UseFavoritesReturn {
  favorites: FavoriteItem[];
  loading: boolean;
  error: string | null;
  isFav: (contentId: number, contentType: ContentType) => boolean;
  toggle: (
    contentId: number,
    contentType: ContentType,
    meta: Omit<AddFavoriteBody, "content_type">,
  ) => Promise<void>;
  reload: () => Promise<void>;
}

export function useFavorites(): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchFavorites();
      setFavorites(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load favorites");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isFav = useCallback(
    (contentId: number, contentType: ContentType): boolean => {
      // Check in-memory state first, fall back to localStorage.
      const inMemory = favorites.some(
        (f) => f.content_type === contentType && f.content_id === contentId,
      );
      return inMemory || isFavorited(contentId, contentType);
    },
    [favorites],
  );

  const toggle = useCallback(
    async (
      contentId: number,
      contentType: ContentType,
      meta: Omit<AddFavoriteBody, "content_type">,
    ): Promise<void> => {
      const alreadyFav = isFav(contentId, contentType);

      // Optimistic update.
      if (alreadyFav) {
        setFavorites((prev) =>
          prev.filter(
            (f) => !(f.content_type === contentType && f.content_id === contentId),
          ),
        );
      } else {
        const optimistic: FavoriteItem = {
          id: -Date.now(),
          content_type: contentType,
          content_id: contentId,
          content_name: meta.content_name ?? null,
          content_icon: meta.content_icon ?? null,
          category_name: meta.category_name ?? null,
          sort_order: favorites.length + 1,
          added_at: new Date().toISOString(),
        };
        setFavorites((prev) => [...prev, optimistic]);
      }

      // Snapshot for rollback.
      const snapshot = favorites;

      try {
        if (alreadyFav) {
          await removeFavorite(contentId, contentType);
        } else {
          await addFavorite(contentId, { ...meta, content_type: contentType });
        }
      } catch {
        // Rollback on failure.
        setFavorites(snapshot);
      }
    },
    [favorites, isFav],
  );

  return { favorites, loading, error, isFav, toggle, reload };
}
