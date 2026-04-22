/**
 * SeriesGrid — responsive poster grid with D-pad 2D navigation.
 *
 * Constraints:
 *  - No backdrop-filter on the grid container (TV perf).
 *  - Each card uses useFocusable SERIES_CARD_<id>.
 *  - Empty state when items array is empty.
 */
import type { SeriesItem } from "../../api/schemas";
import { SeriesCard } from "./SeriesCard";

interface SeriesGridProps {
  items: SeriesItem[];
  onCardClick: (id: string) => void;
}

export function SeriesGrid({ items, onCardClick }: SeriesGridProps) {
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
    <div
      role="list"
      aria-label="Series grid"
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fill, minmax(min(160px, 100%), 1fr))",
        gap: "var(--space-4)",
        padding: "var(--space-4) var(--space-6)",
      }}
    >
      {items.map((item) => (
        <div key={item.id} role="listitem">
          <SeriesCard item={item} onClick={onCardClick} />
        </div>
      ))}
    </div>
  );
}
