/**
 * TierLockBadge — 🔒 overlay for VOD / episode items whose
 * containerExtension isn't in the Xtream account's allowedFormats.
 *
 * Renders inside a card as a positioned glyph. The parent is responsible
 * for dimming opacity when the badge is shown (see 02-series.md §4 and
 * 03-movies.md §5 for precheck vs reaction tiers).
 *
 * Small, stateless, no focus handling — this is a decoration, not a control.
 */
import type { CSSProperties } from "react";

export interface TierLockBadgeProps {
  /**
   * Tooltip text — exposed as title + aria-label. Defaults to generic copy.
   * Prefer surface-specific messaging when known (e.g. "MP4 not in your plan").
   */
  label?: string;
  /** Additional inline positioning (top/right/etc). Badge is `position: absolute`. */
  style?: CSSProperties;
  className?: string;
}

const defaultStyle: CSSProperties = {
  position: "absolute",
  top: "var(--space-2)",
  right: "var(--space-2)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: "var(--radius-sm)",
  background: "rgba(18, 16, 14, 0.85)",
  color: "var(--text-primary)",
  fontSize: 16,
  lineHeight: 1,
  pointerEvents: "none",
};

export function TierLockBadge({
  label = "Not available on your plan",
  style,
  className,
}: TierLockBadgeProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={className}
      style={{ ...defaultStyle, ...style }}
      data-testid="tier-lock-badge"
    >
      🔒
    </span>
  );
}
