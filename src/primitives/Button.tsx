/**
 * Button — Oxide button primitive (Task 1.4; norigin retrofit 2026-04-22)
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
 *
 * 2026-04-22 retrofit: `focusKey` prop makes the Button a norigin D-pad
 * target. Without this prop, a TV remote cannot focus the button — the
 * original primitive was a norigin dead-end, which stranded users on the
 * LoginPage and ErrorShell actions on Fire TV.
 */
import React from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { cx } from "./cx";
import "./button.css";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Visual style — defaults to "primary". */
  variant?: "primary" | "outlined" | "ghost";
  /** Padding + font-size scale — defaults to "md". */
  size?: "sm" | "md" | "lg";
  /**
   * Forward the HTML `type` attribute. Defaults to "button" (not "submit")
   * so TV remote OK press never triggers accidental form submissions.
   */
  type?: "button" | "submit" | "reset";
  /**
   * Norigin spatial-navigation key. When provided, the Button registers
   * with norigin and becomes a D-pad target. REQUIRED on any TV-reachable
   * surface — without it, Fire TV remotes cannot focus the button.
   */
  focusKey?: string;
  /**
   * D-pad OK / Enter handler. Fires in addition to any `onClick` (mouse
   * click / native Enter-on-focused-button triggers onClick; some TV
   * remotes emit a discrete DPAD_CENTER event that norigin translates to
   * onEnterPress). Wire to the same handler as `onClick` when you want
   * identical behaviour across input methods.
   */
  onEnterPress?: () => void;
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
  focusKey,
  onEnterPress,
  ...rest
}: ButtonProps): React.ReactElement {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusable: Boolean(focusKey),
    focusKey: focusKey ?? "",
    onEnterPress,
  });
  const classes = cx(
    "btn",
    "focus-ring",
    variantClass[variant],
    sizeClass[size],
    focused ? "btn--focused" : "",
    className,
  );

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type={type}
      className={classes}
      {...rest}
    >
      {children}
    </button>
  );
}
