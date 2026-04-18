/**
 * Card — Oxide card primitive (Task 1.5)
 *
 * Renders as:
 *   <div>   — default, non-interactive surface
 *   <button> — when focusable={true}, enables keyboard + TV-remote focus
 *
 * Props:
 *   focusable    — renders as <button> with focus-ring; false = <div>
 *   aspectRatio  — "2/3" | "16/9" | "1/1" via CSS class (not inline style)
 *   className    — merged via cx(), forwarded to root element
 *   onClick      — click handler (only meaningful when focusable=true)
 *
 * TS note: `focusable` without `onClick` is valid — TV D-pad focus doesn't
 * always need a click handler (spatial nav handles selection). Kept lenient
 * rather than compile-time error; documented here as accepted spec ambiguity.
 *
 * CSS lives in src/primitives/card.css (aggregated via primitives/index.css).
 * Spec: plan Task 1.5 + design spec §card.
 */
import React from "react";
import { cx } from "./cx";
import "./card.css";

export interface CardProps {
  children?: React.ReactNode;
  /** When true renders as <button> with focus-ring and hover lift. */
  focusable?: boolean;
  /** Applies an aspect-ratio CSS class for common TV artwork ratios. */
  aspectRatio?: "2/3" | "16/9" | "1/1";
  /** Extra classes merged via cx() onto the root element. */
  className?: string;
  /** Click/OK-press handler (most useful with focusable=true). */
  onClick?: () => void;
}

const aspectClass: Record<NonNullable<CardProps["aspectRatio"]>, string> = {
  "2/3": "card--ar-poster",
  "16/9": "card--ar-backdrop",
  "1/1": "card--ar-square",
};

export function Card({
  children,
  focusable = false,
  aspectRatio,
  className,
  onClick,
}: CardProps): React.ReactElement {
  const Tag = focusable ? "button" : "div";

  const classes = cx(
    "card",
    focusable && "card--focusable",
    focusable && "focus-ring",
    aspectRatio ? aspectClass[aspectRatio] : undefined,
    className,
  );

  return (
    <Tag
      className={classes}
      style={{ background: "var(--bg-surface)" }}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}
