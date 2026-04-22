/**
 * SeriesRoute — Series browse screen (Phase 6).
 *
 * Layout:
 *  - SeriesCategoryStrip at top (horizontal, D-pad ArrowLeft/Right).
 *    Each chip has focusKey: SERIES_CAT_<id>.
 *  - SeriesGrid below (poster cards, D-pad 2D nav).
 *    Each card has focusKey: SERIES_CARD_<id>.
 *  - Skeleton while loading.
 *  - ErrorShell (onRetry) on fetch error — retry preserves activeCategory.
 *  - Empty state when no items in a category.
 *  - Bottom padding clears the dock.
 *
 * MUST PRESERVE: CONTENT_AREA_SERIES FocusContext registration
 * (BottomDock Esc-key routing — Task 2.4 lesson).
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import { useNavigate } from "react-router-dom";
import { ErrorShell } from "../primitives/ErrorShell";
import { Skeleton } from "../primitives/Skeleton";
import { SeriesCategoryStrip } from "../features/series/SeriesCategoryStrip";
import { SeriesGrid } from "../features/series/SeriesGrid";
import { fetchSeriesCategories, fetchSeriesList } from "../api/series";
import type { SeriesCategory, SeriesItem } from "../api/schemas";

export function SeriesRoute() {
  // MUST PRESERVE: norigin root registration for the content area.
  // Dropping this breaks BottomDock's setFocus("CONTENT_AREA_SERIES") Esc flow.
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_SERIES" });
  const navigate = useNavigate();

  const [categories, setCategories] = useState<SeriesCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [items, setItems] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState(false);

  // ─── Initial fetch — categories ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    fetchSeriesCategories()
      .then((cats) => {
        if (cancelled) return;
        setCategories(cats);
        const firstId = cats[0]?.id ?? null;
        setActiveCategoryId(firstId);
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
  }, []);

  // ─── Fetch items when active category changes ─────────────────────────────
  useEffect(() => {
    if (!activeCategoryId) return;

    let cancelled = false;

    // Kick off the fetch; update loading state in the async callback
    // to satisfy react-hooks/set-state-in-effect (no synchronous setState
    // inside the effect body).
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setItemsLoading(true);
        return fetchSeriesList(activeCategoryId);
      })
      .then((list) => {
        if (cancelled || list === undefined) return;
        setItems(list);
        setItemsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Item fetch failure: show empty rather than crash. Categories still visible.
        setItems([]);
        setItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategoryId]);

  // ─── Retry — re-fetches categories WITHOUT resetting activeCategoryId ────
  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);

    fetchSeriesCategories()
      .then((cats) => {
        setCategories(cats);
        // If the previously-selected category still exists, keep it selected.
        // Otherwise fall back to the first category.
        setActiveCategoryId((prev) => {
          const stillExists = cats.some((c) => c.id === prev);
          return stillExists ? prev : (cats[0]?.id ?? null);
        });
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const handleCategorySelect = useCallback((id: string) => {
    setActiveCategoryId(id);
  }, []);

  const handleCardClick = useCallback(
    (seriesId: string) => {
      navigate(`/series/${seriesId}`);
    },
    [navigate],
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="series"
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
          /* Loading state — category strip + grid skeletons */
          <div
            style={{
              padding: "var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <Skeleton width="100%" height={52} />
            <Skeleton width="100%" height={400} />
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
            {/* Category strip */}
            <SeriesCategoryStrip
              categories={categories}
              activeId={activeCategoryId}
              onSelect={handleCategorySelect}
            />

            {/* Poster grid — skeleton while items are loading */}
            {itemsLoading ? (
              <div
                style={{
                  padding: "var(--space-6)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-4)",
                }}
              >
                <Skeleton width="100%" height={360} />
              </div>
            ) : (
              <SeriesGrid items={items} onCardClick={handleCardClick} />
            )}
          </>
        )}
      </main>
    </FocusContext.Provider>
  );
}
