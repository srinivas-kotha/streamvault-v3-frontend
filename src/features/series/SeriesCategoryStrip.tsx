/**
 * SeriesCategoryStrip — horizontal scrollable chip strip with D-pad navigation.
 *
 * Each chip uses useFocusable with focusKey: SERIES_CAT_<id>.
 * Active/focused chip shows copper accent.
 *
 * Constraints:
 *  - No backdrop-filter.
 *  - No transition-all.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { SeriesCategory } from "../../api/schemas";

interface CategoryChipProps {
  category: SeriesCategory;
  isActive: boolean;
  onSelect: () => void;
}

function CategoryChip({ category, isActive, onSelect }: CategoryChipProps) {
  const { ref, focused } = useFocusable({
    focusKey: `SERIES_CAT_${category.id}`,
    onEnterPress: onSelect,
  });

  const highlight = isActive || focused;

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-pressed={isActive}
      onClick={onSelect}
      className="focus-ring"
      style={{
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--radius-pill)",
        border: highlight
          ? "2px solid var(--accent-copper)"
          : "2px solid var(--bg-surface)",
        background: highlight ? "var(--accent-copper)" : "var(--bg-surface)",
        color: highlight ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-tracking)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
        outline: "none",
        flexShrink: 0,
      }}
    >
      {category.name}
      {category.count !== undefined && category.count > 0 && (
        <span
          aria-label={`${category.count} series`}
          style={{ marginLeft: "var(--space-1)", opacity: 0.7 }}
        >
          {category.count}
        </span>
      )}
    </button>
  );
}

interface SeriesCategoryStripProps {
  categories: SeriesCategory[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function SeriesCategoryStrip({
  categories,
  activeId,
  onSelect,
}: SeriesCategoryStripProps) {
  if (categories.length === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Series categories"
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "var(--space-2)",
        padding: "var(--space-4) var(--space-6)",
        overflowX: "auto",
        /* Hide scrollbar visually on TV — scrolled via D-pad */
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        borderBottom: "1px solid var(--bg-surface)",
      }}
    >
      {categories.map((cat) => (
        <CategoryChip
          key={cat.id}
          category={cat}
          isActive={activeId === cat.id}
          onSelect={() => onSelect(cat.id)}
        />
      ))}
    </div>
  );
}
