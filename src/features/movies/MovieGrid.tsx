/**
 * MovieGrid — responsive poster grid with react-virtuoso virtualization.
 *
 * Virtualization mandate (Issue #59):
 *   The VOD catalog has ~61,000 rows. Without virtualization, the Silk browser
 *   on Fire TV OOMs at ~600–1000 cards. VirtuosoGrid keeps the DOM card count
 *   under ~150 regardless of catalog size.
 *
 *   MoviesRoute → MovieGrid uses VirtuosoGrid (Issue #59)
 *
 * Grid: 6 columns at 1920px, auto-fill down to ~120px min (same geometry as
 * before virtualization). Each card retains its useFocusable registration so
 * norigin D-pad navigation is unchanged.
 *
 * Overscan: 500px (≈ 2–3 rows at typical card height) keeps the focused card
 * mounted during ordinary D-pad scrolling, preventing norigin from losing
 * focus when a card is virtualized out.
 *
 * Renders MovieCard per stream, plus an empty state when the list is empty.
 */
import { useMemo } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { MovieCard } from "./MovieCard";
import { usePlayerOpener } from "../../player";
import type { VodStream } from "../../api/schemas";

interface MovieGridProps {
  streams: VodStream[];
}

// Container for the CSS grid — applied as the VirtuosoGrid List component.
// Must be a stable reference (defined outside the render function) so Virtuoso
// does not remount the grid container on every render.
const GridList = ({ style, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    {...rest}
    aria-label="Movie poster grid"
    style={{
      ...style,
      display: "grid",
      // 6 columns at 1920px, auto-fill down to ~120px min (same as pre-virtuoso)
      gridTemplateColumns:
        "repeat(auto-fill, minmax(clamp(120px, 14vw, 280px), 1fr))",
      gap: "var(--space-4)",
      padding: "var(--space-6)",
    }}
  />
);

// Wrapper for each grid cell — Virtuoso needs an Item wrapper that does NOT
// alter layout (no flex/grid on its own; the parent List is the grid).
const GridItem = ({ style, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...rest} style={{ ...style, display: "contents" }} />
);

export function MovieGrid({ streams }: MovieGridProps) {
  // Enter on a poster opens the player overlay directly. The detail page
  // (/movies/:id) was never implemented — navigating there produced a blank
  // screen for the user. Opening the player matches the LiveRoute pattern
  // and is the minimum viable path to "press play and it plays".
  const { openPlayer } = usePlayerOpener();

  // Stable components object — must not be re-created inline or Virtuoso
  // will remount the entire grid on every render.
  const components = useMemo(
    () => ({
      List: GridList,
      Item: GridItem,
    }),
    [],
  );

  if (streams.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-12) var(--space-6)",
          color: "var(--text-secondary)",
          gap: "var(--space-4)",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: "48px" }}>
          ○
        </span>
        <p
          style={{
            fontSize: "var(--text-body-size)",
            margin: 0,
          }}
        >
          No movies in this category
        </p>
      </div>
    );
  }

  return (
    <VirtuosoGrid
      // useWindowScroll lets the page scroll naturally (same as the pre-Virtuoso
      // plain div) rather than creating a second inner scrollable container.
      useWindowScroll
      totalCount={streams.length}
      components={components}
      // overscan: keep ~500px of off-screen cards rendered so norigin focus
      // stays mounted during normal D-pad navigation (avoids focus loss when
      // the focused card scrolls just off the viewport edge).
      overscan={500}
      itemContent={(index) => {
        const stream = streams[index];
        if (!stream) return null;
        return (
          <MovieCard
            key={stream.id}
            stream={stream}
            onSelect={(id) =>
              void openPlayer({ kind: "vod", id, title: stream.name })
            }
          />
        );
      }}
    />
  );
}
