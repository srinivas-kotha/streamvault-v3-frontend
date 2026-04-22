/**
 * MoviesRoute — /movies browse screen (Phase 5b).
 *
 * Structure:
 *   FocusContext(CONTENT_AREA_MOVIES)
 *     <main>
 *       CategoryStrip — horizontal D-pad navigable category chips
 *       MovieGrid     — responsive poster grid (6 cols @ 1920px)
 *
 * States:
 *   loading  → Skeleton rows (category strip height + grid height)
 *   error    → ErrorShell with onRetry (NO page reload — SPA state preserved)
 *   empty    → "No movies in this category" inside MovieGrid
 *   content  → CategoryStrip + MovieGrid
 *
 * Data fetching:
 *   - On mount: fetchVodCategories() → auto-select first VOD category →
 *     fetchVodStreams(categoryId)
 *   - On category change: fetchVodStreams(newCategoryId)
 *   - On retry: re-fetches from the top (clears error) without touching
 *     activeCategoryId when the category still exists (Q1).
 *
 * MUST PRESERVE: CONTENT_AREA_MOVIES + FocusContext — load-bearing for
 * BottomDock's setFocus("CONTENT_AREA_MOVIES") Esc-key routing (Task 2.4).
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import { CategoryStrip } from "../features/movies/CategoryStrip";
import { MovieGrid } from "../features/movies/MovieGrid";
import { ErrorShell } from "../primitives/ErrorShell";
import { Skeleton } from "../primitives/Skeleton";
import { fetchVodCategories, fetchVodStreams } from "../api/vod";
import type { VodCategory, VodStream } from "../api/schemas";

export function MoviesRoute() {
  // MUST PRESERVE: norigin root registration for the content area.
  // trackChildren + non-focusable container: when BottomDock fires
  // setFocus("CONTENT_AREA_MOVIES") on ArrowUp, norigin forwards focus to the
  // first child (category chip or poster) rather than staying on the shell.
  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_MOVIES",
    focusable: false,
    trackChildren: true,
  });

  const [categories, setCategories] = useState<VodCategory[]>([]);
  const [streams, setStreams] = useState<VodStream[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ─── Initial fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const cats = await fetchVodCategories();
        if (cancelled) return;

        // Defensive filter: only VOD categories (backend already filters by type)
        const vodCats = cats.filter((c) => c.type === "vod");
        setCategories(vodCats);

        const firstId = vodCats[0]?.id ?? null;
        setActiveCategoryId(firstId);

        if (firstId) {
          const strs = await fetchVodStreams(firstId);
          if (cancelled) return;
          setStreams(strs);
        }

        setLoading(false);
      } catch {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Category change ──────────────────────────────────────────────────────
  const handleCategorySelect = useCallback(
    async (id: string) => {
      if (id === activeCategoryId) return;
      setActiveCategoryId(id);
      try {
        const strs = await fetchVodStreams(id);
        setStreams(strs);
      } catch {
        // If a category's streams fail, show empty state — don't error the whole page
        setStreams([]);
      }
    },
    [activeCategoryId],
  );

  // ─── Retry — preserves activeCategoryId when still valid (Q1) ────────────
  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);

    const load = async () => {
      try {
        const cats = await fetchVodCategories();

        const vodCats = cats.filter((c) => c.type === "vod");
        setCategories(vodCats);

        // Keep the user's cursor if the category still exists; else fall back
        const targetId =
          activeCategoryId !== null &&
          vodCats.some((c) => c.id === activeCategoryId)
            ? activeCategoryId
            : (vodCats[0]?.id ?? null);

        setActiveCategoryId(targetId);

        if (targetId) {
          const strs = await fetchVodStreams(targetId);
          setStreams(strs);
        } else {
          setStreams([]);
        }

        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
      }
    };

    void load();
  }, [activeCategoryId]);

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
          // Chromatic ambient fill behind hero region
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
            <CategoryStrip
              categories={categories}
              activeCategoryId={activeCategoryId}
              onSelectCategory={(id) => void handleCategorySelect(id)}
            />
            <MovieGrid streams={streams} />
          </>
        )}
      </main>
    </FocusContext.Provider>
  );
}
