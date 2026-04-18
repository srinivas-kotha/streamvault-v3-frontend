/**
 * Skeleton — decorative loading placeholder (Task 1.5)
 *
 * Renders a pulsing <div> to indicate in-flight data.
 *
 * Accessibility:
 *   - aria-hidden="true" — screen readers skip it (decorative)
 *   - Animation respects prefers-reduced-motion via CSS media query
 *
 * Sizing: consumers set width/height via className or inline style.
 * The `width` and `height` props map to inline style for convenience.
 *
 * CSS lives in src/primitives/skeleton.css (aggregated via primitives/index.css).
 * Spec: plan Task 1.5 + design spec §skeleton.
 */
import React from "react";
import { cx } from "./cx";
import "./skeleton.css";

export interface SkeletonProps {
  /** Width as px number or CSS string (e.g. "100%", "200px"). */
  width: number | string;
  /** Height as px number or CSS string. */
  height: number | string;
  /** Extra classes for layout / border-radius overrides from parent. */
  className?: string;
}

export function Skeleton({
  width,
  height,
  className,
}: SkeletonProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cx("skeleton", className)}
      style={{ width, height }}
    />
  );
}
