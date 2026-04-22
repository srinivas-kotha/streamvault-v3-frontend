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
        // Glass-panel fill — warm gradient
        background: "var(--card-glass-bg, var(--bg-surface))",
        border: focused
          ? "1px solid var(--accent-copper)"
          : "var(--card-glass-border, 1px solid rgba(237,228,211,0.06))",
        borderRadius: "var(--radius-sm)",
        padding: 0,
        cursor: "pointer",
        /* scale + copper glow on focus — NO transition-all */
        transform: focused ? "scale(1.03)" : "scale(1)",
        boxShadow: focused
          ? "var(--focus-glow, 0 0 0 2px var(--accent-copper), 0 8px 32px -8px rgba(200,121,65,0.45))"
          : "0 2px 6px rgba(0,0,0,0.2)",
        transition:
          "transform 150ms ease-out, box-shadow 150ms ease-out, border-color 150ms ease-out",
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
            fontVariantNumeric: "tabular-nums",
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
