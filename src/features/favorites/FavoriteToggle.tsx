/**
 * FavoriteToggle — focusable star button for cards (Phase 8).
 *
 * Registers its own focusKey (`FAV_TOGGLE_${type}_${id}`) so the D-pad can
 * reach it independently of the parent card body. Press Enter on the star to
 * toggle; press Enter on the card body to play.
 *
 * Design:
 *  - Active (favorited): copper star  ★  (var(--accent-copper))
 *  - Inactive: hollow star  ☆  (var(--text-tertiary), falling back to
 *    var(--text-secondary) if --text-tertiary is not defined)
 *
 * No Framer Motion, no transition-all, no backdrop-filter.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { ContentType } from "../../api/schemas";

export interface FavoriteToggleProps {
  contentId: number;
  contentType: ContentType;
  isFavorited: boolean;
  onToggle: () => void;
  /** Compact size for card use. Default: false (standard size). */
  compact?: boolean;
}

export function FavoriteToggle({
  contentId,
  contentType,
  isFavorited,
  onToggle,
  compact = false,
}: FavoriteToggleProps) {
  const focusKey = `FAV_TOGGLE_${contentType.toUpperCase()}_${contentId}`;
  const { ref, focused } = useFocusable({ focusKey, onEnterPress: onToggle });

  const size = compact ? 20 : 24;
  const isActive = isFavorited || focused;

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorited}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="focus-ring"
      style={{
        background: focused ? "var(--bg-elevated)" : "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        padding: compact ? "2px" : "var(--space-1)",
        lineHeight: 1,
        fontSize: size,
        color: isActive
          ? "var(--accent-copper)"
          : "var(--text-tertiary, var(--text-secondary))",
        transition:
          "color var(--motion-focus), background var(--motion-focus)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span aria-hidden="true">{isFavorited ? "★" : "☆"}</span>
    </button>
  );
}
