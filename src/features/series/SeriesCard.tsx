/**
 * SeriesCard — focusable poster card for the series grid.
 *
 * Constraints:
 *  - useFocusable with focusKey: `SERIES_CARD_<id>` (D-pad registration).
 *  - Focused state: copper outline + scale(1.04) + box-shadow lift.
 *  - <img loading="lazy"> with --bg-surface placeholder for missing posters.
 *  - No Framer Motion. No transition-all. No backdrop-filter.
 *  - No transform on ancestors of position:fixed children.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { SeriesItem } from "../../api/schemas";

interface SeriesCardProps {
  item: SeriesItem;
  onClick: (id: string) => void;
}

export function SeriesCard({ item, onClick }: SeriesCardProps) {
  const { ref, focused } = useFocusable({
    focusKey: `SERIES_CARD_${item.id}`,
    onEnterPress: () => onClick(item.id),
  });

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-label={item.name}
      onClick={() => onClick(item.id)}
      className="focus-ring"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        background: "none",
        border: focused ? "2px solid var(--accent-copper)" : "2px solid transparent",
        borderRadius: "var(--radius-sm)",
        padding: 0,
        cursor: "pointer",
        /* scale + shadow — NO transition-all; scope to transform + box-shadow */
        transform: focused ? "scale(1.04)" : "scale(1)",
        boxShadow: focused
          ? "0 8px 24px rgba(0,0,0,0.5)"
          : "0 2px 6px rgba(0,0,0,0.2)",
        transition:
          "transform var(--motion-focus), box-shadow var(--motion-focus), border-color var(--motion-focus)",
        outline: "none",
        textAlign: "left",
        overflow: "hidden",
      }}
    >
      {/* Poster image */}
      <div
        aria-hidden="true"
        style={{
          width: "100%",
          aspectRatio: "2 / 3",
          background: "var(--bg-surface)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {item.icon ? (
          <img
            src={item.icon}
            alt=""
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          /* Placeholder glyph when no poster is available */
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              color: "var(--text-secondary)",
              opacity: 0.4,
            }}
          >
            ⊞
          </span>
        )}
      </div>

      {/* Title */}
      <span
        style={{
          padding: "var(--space-1) var(--space-2)",
          fontSize: "var(--text-label-size)",
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {item.name}
      </span>

      {/* Optional metadata — rating + year */}
      {(item.rating ?? item.year) && (
        <span
          style={{
            padding: "0 var(--space-2) var(--space-1)",
            fontSize: "var(--text-label-size)",
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {[item.year, item.rating && `★ ${item.rating}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </button>
  );
}
