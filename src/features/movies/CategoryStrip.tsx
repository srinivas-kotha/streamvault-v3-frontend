/**
 * CategoryStrip — horizontal scrollable row of category chips.
 * Each chip is a useFocusable with focusKey: VOD_CAT_<id>.
 * Active / focused chip shows the copper accent.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { VodCategory } from "../../api/schemas";

interface CategoryChipProps {
  category: VodCategory;
  isActive: boolean;
  onSelect: () => void;
}

function CategoryChip({ category, isActive, onSelect }: CategoryChipProps) {
  const { ref, focused } = useFocusable({
    focusKey: `VOD_CAT_${category.id}`,
    onEnterPress: onSelect,
  });
  const highlighted = isActive || focused;

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={category.name}
      onClick={onSelect}
      className="focus-ring"
      style={{
        flexShrink: 0,
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--radius-pill, 999px)",
        border: "none",
        background: highlighted ? "var(--accent-copper)" : "var(--bg-surface)",
        color: highlighted ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-tracking)",
        textTransform: "uppercase",
        fontWeight: highlighted ? 600 : 400,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background var(--motion-focus, 150ms), color var(--motion-focus, 150ms)",
      }}
    >
      {category.name}
      {category.count !== undefined && (
        <span
          aria-hidden="true"
          style={{
            marginLeft: "var(--space-2)",
            fontSize: "var(--text-caption-size)",
            opacity: 0.6,
          }}
        >
          {category.count}
        </span>
      )}
    </button>
  );
}

interface CategoryStripProps {
  categories: VodCategory[];
  activeCategoryId: string | null;
  onSelectCategory: (id: string) => void;
}

export function CategoryStrip({
  categories,
  activeCategoryId,
  onSelectCategory,
}: CategoryStripProps) {
  if (categories.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Movie categories"
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "var(--space-2)",
        overflowX: "auto",
        padding: "var(--space-4) var(--space-6)",
        borderBottom: "1px solid var(--bg-surface)",
        // Avoid scroll-container + transform ancestors (AC-01 — TV perf)
        scrollbarWidth: "none",
      }}
    >
      {categories.map((cat) => (
        <CategoryChip
          key={cat.id}
          category={cat}
          isActive={activeCategoryId === cat.id}
          onSelect={() => onSelectCategory(cat.id)}
        />
      ))}
    </div>
  );
}
