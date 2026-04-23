/**
 * ContinueWatchingChip — leftmost chip in the LanguageRail when the user
 * has an active resume point. Spec: `docs/ux/00-ia-navigation.md` §6.1.
 *
 * Visually distinct from language chips (↻ glyph, neutral copper-tinted
 * background) so users never confuse it with a language filter. Norigin
 * focus key `LANG_CONTINUE` — stable so the rail's parent can target it.
 *
 * Conditional: only mount when history ≥ 1 item. This component is
 * presentational; the rail owns the conditional.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

export interface ContinueWatchingChipProps {
  /** Callback when the user presses Enter / clicks. Typically plays the
   *  most recent history item (respecting its kind — live / vod / series). */
  onSelect: () => void;
  /** Accessible label, defaults to "Continue watching". */
  label?: string;
}

export function ContinueWatchingChip({
  onSelect,
  label = "Continue watching",
}: ContinueWatchingChipProps) {
  const { ref, focused } = useFocusable({
    focusKey: "LANG_CONTINUE",
    onEnterPress: onSelect,
  });

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-label={label}
      onClick={onSelect}
      className="focus-ring"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-5)",
        borderRadius: "var(--radius-pill)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid rgba(200, 121, 65, 0.25)",
        background: focused
          ? "var(--accent-copper)"
          : "rgba(200, 121, 65, 0.12)",
        color: focused ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-body-size)",
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
        ↻
      </span>
      {label}
    </button>
  );
}
