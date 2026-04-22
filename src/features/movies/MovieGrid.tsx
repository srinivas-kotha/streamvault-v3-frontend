/**
 * MovieGrid — responsive poster grid.
 * 6 columns at 1920px, fewer on narrow screens (CSS grid auto-fill).
 * Renders MovieCard per stream, plus an empty state when the list is empty.
 */
import { MovieCard } from "./MovieCard";
import { usePlayerOpener } from "../../player";
import type { VodStream } from "../../api/schemas";

interface MovieGridProps {
  streams: VodStream[];
}

export function MovieGrid({ streams }: MovieGridProps) {
  // Enter on a poster opens the player overlay directly. The detail page
  // (/movies/:id) was never implemented — navigating there produced a blank
  // screen for the user. Opening the player matches the LiveRoute pattern
  // and is the minimum viable path to "press play and it plays".
  const { openPlayer } = usePlayerOpener();

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
    <div
      aria-label="Movie poster grid"
      style={{
        display: "grid",
        // 6 columns at 1920px, auto-fill down to ~150px min
        gridTemplateColumns:
          "repeat(auto-fill, minmax(clamp(120px, 14vw, 280px), 1fr))",
        gap: "var(--space-4)",
        padding: "var(--space-6)",
      }}
    >
      {streams.map((stream) => (
        <MovieCard
          key={stream.id}
          stream={stream}
          onSelect={(id) =>
            void openPlayer({ kind: "vod", id, title: stream.name })
          }
        />
      ))}
    </div>
  );
}
