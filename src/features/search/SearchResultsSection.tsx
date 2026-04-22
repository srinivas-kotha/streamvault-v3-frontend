/**
 * SearchResultsSection — a single labelled row of search result cards.
 *
 * Each card uses useFocusable with key `SEARCH_RESULT_<TYPE>_<ID>`.
 * Enter navigates/plays based on content type:
 *   - series  → navigate to /series/:id (detail + episode picker)
 *   - live    → openPlayer directly
 *   - vod     → openPlayer directly
 *
 * Lazy images with --bg-surface placeholder for missing icons.
 */
import type { RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { usePlayerOpener } from "../../player";
import type { CatalogItem } from "../../api/schemas";
import type { PlayerKind } from "../../player/PlayerProvider";

// Map backend content type → player kind. "vod" is the VOD movies shelf.
// "series" is intentionally omitted — series hits navigate to the detail
// route rather than opening the player directly.
const KIND_MAP: Record<string, PlayerKind> = {
  live: "live",
  vod: "vod",
};

interface SearchCardProps {
  item: CatalogItem;
}

function SearchCard({ item }: SearchCardProps) {
  const { openPlayer } = usePlayerOpener();
  const navigate = useNavigate();
  const focusKey = `SEARCH_RESULT_${item.type.toUpperCase()}_${item.id}`;

  const activateItem = () => {
    if (item.type === "series") {
      // Series hits go to the detail page — not the player.
      navigate(`/series/${encodeURIComponent(item.id)}`);
      return;
    }
    const kind = KIND_MAP[item.type] ?? "vod";
    void openPlayer({ kind, id: item.id, title: item.name });
  };

  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey,
    onEnterPress: activateItem,
  });

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      onClick={activateItem}
      aria-label={item.name}
      style={{
        flex: "0 0 auto",
        width: 160,
        background: focused ? "var(--bg-elevated)" : "var(--bg-surface)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid transparent",
        borderRadius: "var(--radius-sm)",
        color: "var(--text-primary)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "var(--space-3)",
        gap: "var(--space-2)",
        textAlign: "center",
        // Avoid transition-all — only transition the properties we need
        transition:
          "background var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      <div
        style={{
          width: 120,
          height: 90,
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {item.icon ? (
          <img
            src={item.icon}
            alt=""
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              background: "var(--bg-elevated)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              color: "var(--text-secondary)",
            }}
          >
            {item.type === "live" ? "●" : item.type === "vod" ? "▶" : "⊞"}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: "var(--text-label-size)",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          lineHeight: 1.3,
        }}
      >
        {item.name}
      </span>
    </button>
  );
}

interface SearchResultsSectionProps {
  title: string;
  items: CatalogItem[];
}

export function SearchResultsSection({
  title,
  items,
}: SearchResultsSectionProps) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label={title}
      style={{
        padding: "var(--space-4) var(--space-6)",
      }}
    >
      <h2
        style={{
          color: "var(--text-secondary)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-tracking)",
          textTransform: "uppercase",
          marginBottom: "var(--space-3)",
        }}
      >
        {title}
      </h2>
      <div
        role="list"
        aria-label={`${title} results`}
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "var(--space-3)",
          overflowX: "auto",
          paddingBottom: "var(--space-2)",
        }}
      >
        {items.map((item) => (
          <div key={item.id} role="listitem">
            <SearchCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
