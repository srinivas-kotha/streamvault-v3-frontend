/**
 * MovieGrid — virtualized poster grid using row-chunking.
 *
 * Why row-chunks instead of VirtuosoGrid:
 *   VirtuosoGrid + CSS Grid `auto-fill` + `useWindowScroll` measured row
 *   heights unreliably in prod and the viewport froze at a single visible
 *   card for a 3,706-item Telugu union (observed 2026-04-23 after PR #75).
 *   Row-chunking turns the 2-D grid into a 1-D list of row items, which is
 *   Virtuoso's happy path — each row has a measurable box and windowing
 *   works out of the box.
 *
 * Spec compliance: 03-movies.md §3 still honoured — DOM card count stays
 * bounded (COLS × overscan rows ≈ 30-60 cards live at once), catalogs of
 * 61k items remain scrollable without OOM on Silk.
 *
 * Responsive columns: COLS is picked from viewport width on mount + on
 * resize. The poster aspect ratio is 2:3, so rows have a predictable
 * height that Virtuoso measures once per breakpoint.
 */
import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { MovieCard, type MovieCardProgress } from "./MovieCard";
import type { VodStream } from "../../api/schemas";

export interface MovieGridProps {
  streams: VodStream[];
  onSelect: (stream: VodStream) => void;
  onMoreInfo: (stream: VodStream) => void;
  getProgress?: (stream: VodStream) => MovieCardProgress | undefined;
  isWatched?: (stream: VodStream) => boolean;
  isTierLocked?: (stream: VodStream) => boolean;
}

function columnsForWidth(width: number): number {
  // Sized for TV viewports: Fire TV Silk reports ~1280 CSS px at 1080p (DPR=2)
  // and ~1600-1920 at 4K; posters were too large on TV at prior column counts
  // (reported 2026-04-23 from a real Fire TV). Bump each tier by one so cards
  // settle at ~200-220 px wide on TV, matching Netflix/Prime density.
  if (width >= 1600) return 7;
  if (width >= 1280) return 6;
  if (width >= 960) return 5;
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

export function MovieGrid({
  streams,
  onSelect,
  onMoreInfo,
  getProgress,
  isWatched,
  isTierLocked,
}: MovieGridProps) {
  const cols = useResponsiveColumns();

  const rows = useMemo<VodStream[][]>(() => {
    const out: VodStream[][] = [];
    for (let i = 0; i < streams.length; i += cols) {
      out.push(streams.slice(i, i + cols));
    }
    return out;
  }, [streams, cols]);

  return (
    <div aria-label="Movie poster grid" role="grid">
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
                gap: "var(--space-4)",
                padding: "0 var(--space-6)",
                marginTop: rowIndex === 0 ? "var(--space-6)" : 0,
                marginBottom: "var(--space-4)",
              }}
            >
              {row.map((stream) => {
                const progress = getProgress?.(stream);
                return (
                  <div role="gridcell" key={stream.id}>
                    <MovieCard
                      stream={stream}
                      onSelect={onSelect}
                      onMoreInfo={onMoreInfo}
                      {...(progress ? { progress } : {})}
                      watched={isWatched?.(stream) ?? false}
                      tierLocked={isTierLocked?.(stream) ?? false}
                    />
                  </div>
                );
              })}
            </div>
          );
        }}
      />
    </div>
  );
}
