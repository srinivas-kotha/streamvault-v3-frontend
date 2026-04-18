import React from "react";

export interface FocusRingProps {
  children: React.ReactElement<{ className?: string }>;
  /**
   * 'standard' — 2px copper outline + glow on --bg-base / --bg-surface backgrounds.
   * 'imagery'  — compound ring (copper + white separator + dark outer halo) for elements
   *              overlaying poster backdrops (Detail page). Guarantees visibility on any
   *              poster palette (spec §7.6).
   */
  variant?: "standard" | "imagery";
  /** Extra classes forwarded onto the child (e.g. layout utilities). */
  className?: string;
}

/**
 * FocusRing — Oxide focus-ring primitive.
 *
 * Uses React.cloneElement to inject the focus-ring class directly onto its
 * single child. No wrapper element is rendered, preserving spatial-navigation
 * ref chains (norigin-spatial-navigation relies on unbroken DOM refs).
 *
 * CSS lives in src/primitives/focus-ring.css (imported via src/main.tsx).
 */
export function FocusRing({
  children,
  variant = "standard",
  className = "",
}: FocusRingProps): React.ReactElement {
  const child = React.Children.only(children);
  const existingClass = child.props.className ?? "";

  const classes = [
    existingClass,
    "focus-ring",
    variant === "imagery" ? "focus-ring--imagery" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return React.cloneElement(child, { className: classes });
}
