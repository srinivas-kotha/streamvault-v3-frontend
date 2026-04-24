/**
 * SeriesGrid — virtualized poster grid using row-chunking (mirror of
 * MovieGrid — see that file's header for the VirtuosoGrid-vs-row-chunks
 * reasoning).
 *
 * Prior behaviour was plain CSS grid; under Fire TV throttling, rendering
 * 666+ cards simultaneously caused 96% dropped frames on D-pad scroll
 * (measured 2026-04-24, PR #111 findings). Virtualized rows keep the DOM
 * bounded (COLS × overscan rows ≈ 30-60 cards live) so scroll stays
 * smooth on low-RAM Silk.
 *
 * Column tiers mirror MovieGrid exactly so both surfaces have identical
 * density on the same viewport width.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Virtuoso } from "react-virtuoso";
import type { SeriesItem } from "../../api/schemas";
import { SeriesCard, type SeriesCardProgress } from "./SeriesCard";

export interface SeriesGridProps {
  items: SeriesItem[];
  onCardClick: (id: string) => void;
  /** Optional progress lookup for the most-recently-watched episode. */
  getProgress?: (item: SeriesItem) => SeriesCardProgress | undefined;
  /** Optional "S2E4" shorthand for the last-watched episode. */
  getSEpLabel?: (item: SeriesItem) => string | undefined;
  /** Optional NEW-pill predicate (default: nothing is new). */
  isNew?: (item: SeriesItem) => boolean;
  /**
   * Escape hatch for callers that want to override card rendering entirely
   * (e.g. to wire extra props or substitute a different card). Ignored when
   * omitted.
   */
  renderCard?: (item: SeriesItem) => ReactNode;
}

function columnsForWidth(width: number): number {
  // Mirror MovieGrid.columnsForWidth — keeps Series density identical to
  // Movies at every breakpoint. See MovieGrid.tsx for the rationale.
  if (width >= 1920) return 9;
  if (width >= 1600) return 8;
  if (width >= 1280) return 7;
  if (width >= 960) return 6;
  if (width >= 640) return 4;
  return 3;
}

function useResponsiveColumns(): number {
  const [cols, setCols] = useState<number>(() =>
    typeof window === "undefined" ? 6 : columnsForWidth(window.innerWidth),
  );
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCols(columnsForWidth(window.innerWidth));
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, []);
  return cols;
}

export function SeriesGrid({
  items,
  onCardClick,
  getProgress,
  getSEpLabel,
  isNew,
  renderCard,
}: SeriesGridProps) {
  const cols = useResponsiveColumns();

  const rows = useMemo<SeriesItem[][]>(() => {
    const out: SeriesItem[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      out.push(items.slice(i, i + cols));
    }
    return out;
  }, [items, cols]);

  if (items.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-8)",
          color: "var(--text-secondary)",
          gap: "var(--space-4)",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: "3rem", opacity: 0.4 }}>
          ○
        </span>
        <p style={{ margin: 0, fontSize: "var(--text-body-size)" }}>
          No series in this category.
        </p>
      </div>
    );
  }

  return (
    <div aria-label="Series poster grid" role="grid">
      <Virtuoso
        useWindowScroll
        totalCount={rows.length}
        overscan={600}
        itemContent={(rowIndex) => {
          const row = rows[rowIndex];
          if (!row) return null;
          return (
            <div
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: "var(--space-3)",
                padding: "0 var(--space-6)",
                marginTop: rowIndex === 0 ? "var(--space-3)" : 0,
                marginBottom: "var(--space-3)",
              }}
            >
              {row.map((item) => (
                <div role="gridcell" key={item.id}>
                  {renderCard ? (
                    renderCard(item)
                  ) : (
                    <SeriesCard
                      item={item}
                      onClick={onCardClick}
                      {...(getProgress
                        ? (() => {
                            const p = getProgress(item);
                            return p ? { progress: p } : {};
                          })()
                        : {})}
                      {...(getSEpLabel
                        ? (() => {
                            const s = getSEpLabel(item);
                            return s ? { sEpLabel: s } : {};
                          })()
                        : {})}
                      isNew={isNew?.(item) ?? false}
                    />
                  )}
                </div>
              ))}
            </div>
          );
        }}
      />
    </div>
  );
}
