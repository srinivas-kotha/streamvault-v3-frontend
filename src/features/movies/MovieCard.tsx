/**
 * MovieCard — poster card for the VOD grid.
 * focusKey: VOD_CARD_<id>
 * Focused state: copper outline + scale(1.04) + lifted shadow.
 * Uses lazy <img> with --bg-surface fallback.
 *
 * ⋯ overflow menu (#58): shown in the title bar of the focused card.
 * D-pad Right from the card → OverflowMenu trigger (MOVIE_OVERFLOW_<id>).
 * See docs/ux/03-movies.md §2b for the full interaction spec.
 */
import type { RefObject } from "react";
import { useMemo } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { OverflowMenu } from "../../components/OverflowMenu";
import { addFavorite, removeFavorite } from "../../api/favorites";
import { recordHistory } from "../../api/history";
import type { VodStream } from "../../api/schemas";

interface MovieCardProps {
  stream: VodStream;
  onSelect: (id: string) => void;
}

export function MovieCard({ stream, onSelect }: MovieCardProps) {
  const { ref, focused } = useFocusable({
    focusKey: `VOD_CARD_${stream.id}`,
    onEnterPress: () => onSelect(stream.id),
  });

  const overflowFocusKey = `MOVIE_OVERFLOW_${stream.id}`;

  // ⋯ overflow actions for this movie.
  // TODO(#58): "Mark as watched" uses duration_seconds: 0 as a placeholder
  // because VodStream has no duration field in the current schema. Wire to
  // the real duration once /api/vod/search returns duration_minutes (#59 P1).
  // TODO(#58): "Add to favorites" / "Remove from favorites" both fire
  // optimistically via localStorage. The backend POST/DELETE /api/favorites
  // endpoints exist (favorites.ts) and are wired here.
  const overflowActions = useMemo(() => [
    {
      label: "Add to favorites",
      onSelect: () => {
        void addFavorite(Number(stream.id), {
          content_type: "vod",
          content_name: stream.name,
          content_icon: stream.icon ?? undefined,
          category_name: undefined,
        });
      },
    },
    {
      label: "Mark as watched",
      onSelect: () => {
        // TODO(#58): duration unknown at this level — recording with 0/0 marks
        // the entry in history without a valid progress ratio. Replace with
        // real duration_seconds once the field lands in VodStream schema.
        void recordHistory(Number(stream.id), {
          content_type: "vod",
          content_name: stream.name,
          content_icon: stream.icon ?? undefined,
          progress_seconds: 0,
          duration_seconds: 0,
        });
      },
    },
    {
      label: "Remove from favorites",
      onSelect: () => {
        void removeFavorite(Number(stream.id), "vod");
      },
    },
  ], [stream]);

  return (
    // Outer wrapper — position:relative so the ⋯ trigger can overlay the title bar.
    // Not a button; the inner <button> holds norigin focus + card interaction.
    <div
      style={{
        position: "relative",
        // Scale on focus — no transform on ancestors (AC constraint respected)
        transform: focused ? "scale(1.03)" : "scale(1)",
        transition: "transform 150ms ease-out",
      }}
    >
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        aria-label={stream.name}
        onClick={() => onSelect(stream.id)}
        className="focus-ring"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          // Glass-panel fill — warm gradient over surface
          background: "var(--card-glass-bg, var(--bg-surface))",
          border: focused
            ? "1px solid var(--accent-copper)"
            : "var(--card-glass-border, 1px solid rgba(237,228,211,0.06))",
          borderRadius: "var(--radius-sm, 6px)",
          padding: 0,
          cursor: "pointer",
          // Copper glow on focus; subtle shadow at rest
          boxShadow: focused
            ? "var(--focus-glow, 0 0 0 2px var(--accent-copper), 0 8px 32px -8px rgba(200,121,65,0.45))"
            : "0 2px 8px rgba(0,0,0,0.3)",
          transition:
            "box-shadow 150ms ease-out, border-color 150ms ease-out",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        {/* Poster image — 2:3 aspect ratio */}
        <div
          style={{
            width: "100%",
            paddingBottom: "150%", // 2:3 aspect
            position: "relative",
            background: "var(--bg-elevated, #2a2520)",
          }}
        >
          {stream.icon ? (
            <img
              src={stream.icon}
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
                // Hide broken image, show placeholder bg
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
        </div>

        {/* Title bar */}
        <div
          style={{
            padding: "var(--space-2) var(--space-3)",
            paddingRight: focused ? "calc(var(--space-3) + 40px)" : "var(--space-3)",
            color: "var(--text-primary)",
            fontSize: "var(--text-label-size)",
            letterSpacing: "var(--text-label-tracking)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            transition: "padding-right 150ms ease-out",
          }}
        >
          {stream.name}
        </div>

        {/* Year + rating badge */}
        {(stream.year ?? stream.rating) && (
          <div
            style={{
              padding: "0 var(--space-3) var(--space-2)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-caption-size)",
              fontVariantNumeric: "tabular-nums",
              display: "flex",
              gap: "var(--space-2)",
            }}
          >
            {stream.year && <span>{stream.year}</span>}
            {stream.rating && <span>★ {stream.rating}</span>}
          </div>
        )}
      </button>

      {/* ⋯ overflow menu — visible only when card is focused; positioned in
          the top-right of the title bar area. Reachable via ArrowRight from
          the card. See docs/ux/03-movies.md §2b. */}
      {focused && (
        <div
          style={{
            position: "absolute",
            // Align with the title bar: poster is 150% padding-bottom, so
            // the title sits below the poster. We use bottom so the trigger
            // floats above the meta line.
            bottom: "var(--space-2)",
            right: "var(--space-2)",
            zIndex: 10,
          }}
        >
          <OverflowMenu
            focusKey={overflowFocusKey}
            actions={overflowActions}
            triggerLabel={`More actions for ${stream.name}`}
            placement="below"
          />
        </div>
      )}
    </div>
  );
}
