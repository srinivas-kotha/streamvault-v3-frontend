/**
 * Button — Oxide button primitive (Task 1.4)
 *
 * Variants: primary (default) | outlined | ghost
 * Sizes:    sm | md (default) | lg
 *
 * Design decisions:
 * - Native <button> for semantics and keyboard focus out-of-the-box.
 * - `type="button"` default prevents accidental form submission on TV remote OK.
 * - `focus-ring` class injected directly (no FocusRing wrapper) — avoids cloneElement
 *   overhead and keeps the DOM ref chain clean for norigin-spatial-navigation.
 * - All colours via CSS custom properties only (no hardcoded hex).
 * - CSS lives in src/primitives/button.css (aggregated via primitives/index.css).
 *
 * Spec: plan Task 1.4 + design spec §8 focus ring.
 */
import React from "react";
import "./button.css";

export interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type"
> {
  /** Visual style — defaults to "primary". */
  variant?: "primary" | "outlined" | "ghost";
  /** Padding + font-size scale — defaults to "md". */
  size?: "sm" | "md" | "lg";
  /**
   * Forward the HTML `type` attribute. Defaults to "button" (not "submit")
   * so TV remote OK press never triggers accidental form submissions.
   */
  type?: "button" | "submit" | "reset";
}

const variantClass: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "btn--primary",
  outlined: "btn--outlined",
  ghost: "btn--ghost",
};

const sizeClass: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "btn--sm",
  md: "btn--md",
  lg: "btn--lg",
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps): React.ReactElement {
  const classes = [
    "btn",
    "focus-ring",
    variantClass[variant],
    sizeClass[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
