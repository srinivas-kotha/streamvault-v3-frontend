/**
 * SeriesGrid — responsive poster grid with D-pad 2D navigation.
 *
 * Plain CSS grid (no virtualization) — series counts per language are
 * typically <500 (02-series.md §2), well under the DOM-node ceiling.
 * Card progress / NEW / S_E_ overlays are computed per-item via the
 * optional predicates so this component stays dumb about history shape.
 */
import type { ReactNode } from "react";
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

export function SeriesGrid({
  items,
  onCardClick,
  getProgress,
  getSEpLabel,
  isNew,
  renderCard,
}: SeriesGridProps) {
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
          {renderCard ? (
            renderCard(item)
          ) : (
            (() => {
              const prog = getProgress?.(item);
              const sEp = getSEpLabel?.(item);
              return (
                <SeriesCard
                  item={item}
                  onClick={onCardClick}
                  {...(prog ? { progress: prog } : {})}
                  {...(sEp ? { sEpLabel: sEp } : {})}
                  isNew={isNew?.(item) ?? false}
                />
              );
            })()
          )}
        </div>
      ))}
    </div>
  );
}
