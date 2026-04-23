/**
 * MovieGrid — VirtuosoGrid wrapper for the VOD poster grid.
 *
 * Virtualization mandate (03-movies.md §3 + §4): the VOD catalog has ~61k
 * rows. Without virtualization, the Silk browser on Fire TV OOMs around
 * ~600–1000 cards. VirtuosoGrid keeps DOM card count under ~150 regardless
 * of list length.
 *
 * Card state lookups (progress / watched / tier-locked) are supplied by the
 * route through the lookup functions in props so the grid stays stateless
 * across re-renders and language/sort switches. Lookups must be referentially
 * stable (useCallback on the route side) or the item key churns.
 *
 * Focus persistence: each MovieCard uses `VOD_CARD_<id>` as its focus key,
 * and the 500px overscan keeps the focused card mounted through normal
 * D-pad scroll. VirtuosoGrid's default windowing would otherwise unmount the
 * focused key, which norigin handles by silently losing focus — a known
 * anti-pattern flagged in MEMORY.md (feedback_e2e-not-done-until-proven).
 */
import { useMemo } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { MovieCard, type MovieCardProgress } from "./MovieCard";
import type { VodStream } from "../../api/schemas";

export interface MovieGridProps {
  streams: VodStream[];
  onSelect: (stream: VodStream) => void;
  onMoreInfo: (stream: VodStream) => void;
  /** Return the watch progress for a given stream, or undefined. */
  getProgress?: (stream: VodStream) => MovieCardProgress | undefined;
  /** Return true if the stream is fully watched (≥90% or explicitly marked). */
  isWatched?: (stream: VodStream) => boolean;
  /** Return true if the stream's container is known unplayable under the plan. */
  isTierLocked?: (stream: VodStream) => boolean;
}

const GridList = ({
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    {...rest}
    aria-label="Movie poster grid"
    style={{
      ...style,
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fill, minmax(clamp(120px, 14vw, 280px), 1fr))",
      gap: "var(--space-4)",
      padding: "var(--space-6)",
    }}
  />
);

const GridItem = ({ style, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...rest} style={{ ...style, display: "contents" }} />
);

export function MovieGrid({
  streams,
  onSelect,
  onMoreInfo,
  getProgress,
  isWatched,
  isTierLocked,
}: MovieGridProps) {
  const components = useMemo(
    () => ({
      List: GridList,
      Item: GridItem,
    }),
    [],
  );

  return (
    <VirtuosoGrid
      useWindowScroll
      totalCount={streams.length}
      components={components}
      overscan={500}
      itemContent={(index) => {
        const stream = streams[index];
        if (!stream) return null;
        const progress = getProgress?.(stream);
        return (
          <MovieCard
            key={stream.id}
            stream={stream}
            onSelect={onSelect}
            onMoreInfo={onMoreInfo}
            {...(progress ? { progress } : {})}
            watched={isWatched?.(stream) ?? false}
            tierLocked={isTierLocked?.(stream) ?? false}
          />
        );
      }}
    />
  );
}
