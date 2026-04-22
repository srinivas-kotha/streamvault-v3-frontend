/**
 * MovieCard — poster card for the VOD grid.
 * focusKey: VOD_CARD_<id>
 * Focused state: copper outline + scale(1.04) + lifted shadow.
 * Uses lazy <img> with --bg-surface fallback.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
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

  return (
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
        // Glass-panel fill — warm gradient over surface
        background: "var(--card-glass-bg, var(--bg-surface))",
        border: focused
          ? "1px solid var(--accent-copper)"
          : "var(--card-glass-border, 1px solid rgba(237,228,211,0.06))",
        borderRadius: "var(--radius-sm, 6px)",
        padding: 0,
        cursor: "pointer",
        // Scale on focus — no transform on ancestors (AC constraint respected)
        transform: focused ? "scale(1.03)" : "scale(1)",
        // Copper glow on focus; subtle shadow at rest
        boxShadow: focused
          ? "var(--focus-glow, 0 0 0 2px var(--accent-copper), 0 8px 32px -8px rgba(200,121,65,0.45))"
          : "0 2px 8px rgba(0,0,0,0.3)",
        transition:
          "transform 150ms ease-out, box-shadow 150ms ease-out, border-color 150ms ease-out",
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
          color: "var(--text-primary)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-tracking)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
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
  );
}
