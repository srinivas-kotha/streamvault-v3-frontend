/**
 * Oxide Primitives — barrel export (Task 1.5)
 *
 * Import from here in application code:
 *   import { Button, Card, Skeleton, cx } from "@/primitives";
 *
 * Task 1.7 requires this barrel — landing it here avoids churn later.
 */
export { Button, type ButtonProps } from "./Button";
export { Card, type CardProps } from "./Card";
export { FocusRing, type FocusRingProps } from "./FocusRing";
export { Skeleton, type SkeletonProps } from "./Skeleton";
export { cx } from "./cx";
