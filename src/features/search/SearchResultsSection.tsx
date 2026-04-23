/**
 * SearchResultsSection — a single labelled row of search result cards.
 *
 * Each card uses useFocusable with key `SEARCH_RESULT_<TYPE>_<ID>`.
 * Enter navigates/plays based on content type:
 *   - series  → navigate to /series/:id (detail + episode picker)
 *   - live    → openPlayer directly
 *   - vod     → openPlayer directly
 *
 * ⋯ OverflowMenu (focus-only render) gives the user Play / Add-to-favorites /
 * More-info reachability so they can favorite a hit without playing it first.
 */
import type { RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { OverflowMenu } from "../../components/OverflowMenu";
import { usePlayerOpener } from "../../player";
import {
  addFavorite,
  removeFavorite,
  isFavorited,
} from "../../api/favorites";
import type { CatalogItem, ContentType } from "../../api/schemas";
import type { PlayerKind } from "../../player/PlayerProvider";

// Map backend content type → player kind. "vod" is the VOD movies shelf.
// "series" is intentionally omitted — series hits navigate to the detail
// route rather than opening the player directly.
const KIND_MAP: Record<string, PlayerKind> = {
  live: "live",
  vod: "vod",
};

const FAVORITE_TYPE: Record<CatalogItem["type"], ContentType> = {
  live: "channel",
  vod: "vod",
  series: "series",
};

interface SearchCardProps {
  item: CatalogItem;
}

function SearchCard({ item }: SearchCardProps) {
  const { openPlayer } = usePlayerOpener();
  const navigate = useNavigate();
  const focusKey = `SEARCH_RESULT_${item.type.toUpperCase()}_${item.id}`;

  const favoriteType = FAVORITE_TYPE[item.type];
  const numericId = Number(item.id);

  const activateItem = () => {
    if (item.type === "series") {
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

  const [favorited, setFavorited] = useState(() =>
    Number.isFinite(numericId) ? isFavorited(numericId, favoriteType) : false,
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sv_favorites" && Number.isFinite(numericId)) {
        setFavorited(isFavorited(numericId, favoriteType));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [numericId, favoriteType]);

  const overflowActions = useMemo(
    () => [
      {
        label: item.type === "series" ? "Open" : "Play",
        onSelect: activateItem,
      },
      favorited
        ? {
            label: "Remove from favorites",
            onSelect: () => {
              if (Number.isFinite(numericId)) {
                void removeFavorite(numericId, favoriteType);
                setFavorited(false);
              }
            },
          }
        : {
            label: "Add to favorites",
            onSelect: () => {
              if (!Number.isFinite(numericId)) return;
              void addFavorite(numericId, {
                content_type: favoriteType,
                content_name: item.name,
                ...(item.icon ? { content_icon: item.icon } : {}),
              });
              setFavorited(true);
            },
          },
    ],
    // activateItem closes over navigate/openPlayer which are hook-stable;
    // favorited toggles re-memo naturally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favorited, item, numericId, favoriteType],
  );

  return (
    <div style={{ position: "relative", flex: "0 0 auto" }}>
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        onClick={activateItem}
        aria-label={item.name}
        style={{
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

      {focused && Number.isFinite(numericId) && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 10,
          }}
        >
          <OverflowMenu
            focusKey={`SEARCH_OVERFLOW_${item.type.toUpperCase()}_${item.id}`}
            actions={overflowActions}
            triggerLabel={`More actions for ${item.name}`}
            placement="below"
          />
        </div>
      )}
    </div>
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
