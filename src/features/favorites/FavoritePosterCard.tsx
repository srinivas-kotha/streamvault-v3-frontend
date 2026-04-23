/**
 * FavoritePosterCard — 2:3 poster card for /favorites.
 *
 * Visually parallel to MovieCard/SeriesCard so /favorites feels like a
 * sibling destination. Activation matches the card-activation matrix
 * (IA §2.3): Live → openPlayer, VOD → openPlayer, Series → navigate.
 *
 * OverflowMenu (⋯) renders only while the card is focused, same pattern
 * as MovieCard. Actions vary by content type.
 */
import type { RefObject } from "react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { OverflowMenu } from "../../components/OverflowMenu";
import { usePlayerOpener } from "../../player";
import type { FavoriteItem, ContentType } from "../../api/schemas";

interface FavoritePosterCardProps {
  item: FavoriteItem;
  onRemove: (contentId: number, contentType: ContentType) => void;
  onMoreInfo?: (item: FavoriteItem) => void;
}

const TYPE_GLYPH: Record<ContentType, string> = {
  channel: "●",
  vod: "▶",
  series: "⊞",
};

function defaultIconGlyph(type: ContentType): string {
  return TYPE_GLYPH[type];
}

export function FavoritePosterCard({
  item,
  onRemove,
  onMoreInfo,
}: FavoritePosterCardProps) {
  const { openPlayer } = usePlayerOpener();
  const navigate = useNavigate();
  const focusKey = `FAV_CARD_${item.content_type.toUpperCase()}_${item.content_id}`;

  const activate = useCallback(() => {
    const title = item.content_name ?? `Item ${item.content_id}`;
    const id = String(item.content_id);
    if (item.content_type === "series") {
      navigate(`/series/${encodeURIComponent(id)}`);
      return;
    }
    const kind = item.content_type === "channel" ? "live" : "vod";
    void openPlayer({ kind, id, title });
  }, [item, navigate, openPlayer]);

  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey,
    onEnterPress: activate,
  });

  const overflowActions = [
    {
      label: item.content_type === "series" ? "Open series" : "Play",
      onSelect: activate,
    },
    ...(item.content_type === "vod" && onMoreInfo
      ? [
          {
            label: "More info",
            onSelect: () => onMoreInfo(item),
          },
        ]
      : []),
    {
      label: "Remove from favorites",
      onSelect: () => onRemove(item.content_id, item.content_type),
    },
  ];

  const title = item.content_name ?? `Item ${item.content_id}`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        transform: focused ? "scale(1.03)" : "scale(1)",
        transition: "transform var(--motion-focus)",
      }}
    >
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        aria-label={title}
        onClick={activate}
        className="focus-ring"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          background: "var(--card-glass-bg, var(--bg-surface))",
          border: focused
            ? "1px solid var(--accent-copper)"
            : "var(--card-glass-border, 1px solid rgba(237,228,211,0.06))",
          borderRadius: "var(--radius-sm)",
          padding: 0,
          cursor: "pointer",
          boxShadow: focused
            ? "var(--focus-ring-shadow)"
            : "0 2px 8px rgba(0,0,0,0.3)",
          transition:
            "box-shadow var(--motion-focus), border-color var(--motion-focus)",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: "100%",
            paddingBottom: "150%",
            position: "relative",
            background: "var(--bg-elevated)",
          }}
        >
          {item.content_icon ? (
            <img
              src={item.content_icon}
              alt=""
              loading="lazy"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
                color: "var(--text-secondary)",
                opacity: 0.6,
              }}
            >
              {defaultIconGlyph(item.content_type)}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "var(--space-2) var(--space-3)",
            paddingRight: focused
              ? "calc(var(--space-3) + 40px)"
              : "var(--space-3)",
            color: "var(--text-primary)",
            fontSize: "var(--text-label-size)",
            letterSpacing: "var(--text-label-tracking)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            transition: "padding-right var(--motion-focus)",
          }}
        >
          {title}
        </div>

        {item.category_name && (
          <div
            style={{
              padding: "0 var(--space-3) var(--space-2)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-caption-size)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.category_name}
          </div>
        )}
      </button>

      {focused && (
        <div
          style={{
            position: "absolute",
            bottom: "var(--space-2)",
            right: "var(--space-2)",
            zIndex: 10,
          }}
        >
          <OverflowMenu
            focusKey={`FAV_OVERFLOW_${item.content_type.toUpperCase()}_${item.content_id}`}
            actions={overflowActions}
            triggerLabel={`More actions for ${title}`}
            placement="below"
          />
        </div>
      )}
    </div>
  );
}
