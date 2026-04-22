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
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-sm, 6px)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid transparent",
        padding: 0,
        cursor: "pointer",
        // Scale + shadow on focus — no transform on ancestors
        transform: focused ? "scale(1.04)" : "scale(1)",
        boxShadow: focused
          ? "0 8px 24px rgba(0,0,0,0.6)"
          : "0 2px 8px rgba(0,0,0,0.3)",
        transition:
          "transform var(--motion-focus, 150ms), box-shadow var(--motion-focus, 150ms), border-color var(--motion-focus, 150ms)",
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
