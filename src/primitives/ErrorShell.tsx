/**
 * ErrorShell — Oxide error state primitive (Task 1.6)
 *
 * Full-page / full-section error display with:
 *   - role="alert" for screen-reader announcement
 *   - Icon (64px copper, aria-hidden) for visual context
 *   - h2 title + optional p subtext
 *   - Retry button (outlined variant, autoFocus) — D-pad default per spec §7.5
 *   - Optional Back button (ghost variant)
 *   - Optional Report button (ghost variant)
 *
 * All colour values reference Oxide tokens only (no hardcoded hex).
 * Reuses <Button> primitive — no duplicated styles.
 * cx() for all className composition.
 *
 * CSS lives in src/primitives/error-shell.css (aggregated via primitives/index.css).
 * Spec: plan Task 1.6 + design spec §7.5 (D-pad default focus).
 */
import React, { useEffect } from "react";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { Button } from "./Button";
import { cx } from "./cx";
import "./error-shell.css";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Icon variant shown above the title. */
export type ErrorIcon = "warning" | "network" | "empty";

export interface ErrorShellProps {
  /** Primary heading — shown as <h2>. Required. */
  title: string;
  /** Supporting paragraph below the title. */
  subtext?: string;
  /** Icon variant. Defaults to "warning". */
  icon?: ErrorIcon;
  /** Called when user presses Retry. Required. */
  onRetry: () => void;
  /** When provided, renders a Back button (ghost). */
  onBack?: () => void;
  /** When provided, renders a Report button (ghost). */
  onReport?: () => void;
  /** Override Retry button label. Defaults to "Retry". */
  retryLabel?: string;
  /** Override Back button label. Defaults to "Back". */
  backLabel?: string;
  /** Extra classes merged onto the root element via cx(). */
  className?: string;
}

// ─── Icon glyphs ─────────────────────────────────────────────────────────────
// Unicode symbols — aria-hidden so screen readers skip them (the title
// already conveys the error state via role="alert").

const ICONS: Record<ErrorIcon, string> = {
  warning: "⚠",
  network: "📡",
  empty: "○",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ErrorShell({
  title,
  subtext,
  icon = "warning",
  onRetry,
  onBack,
  onReport,
  retryLabel = "Retry",
  backLabel = "Back",
  className,
}: ErrorShellProps): React.ReactElement {
  // Prime norigin to focus Retry on mount — replaces the old `autoFocus`
  // prop, which only moved DOM focus and left norigin's lastFocused
  // pointer empty (Task 2.4 lesson: DOM focus does NOT sync norigin).
  useEffect(() => {
    setFocus("ERROR_RETRY");
  }, []);

  return (
    <div role="alert" className={cx("error-shell", className)}>
      {/* Icon — aria-hidden; role="alert" + h2 carry the semantic load */}
      <span className="error-shell__icon" aria-hidden="true">
        {ICONS[icon]}
      </span>

      {/* Title */}
      <h2 className="error-shell__title">{title}</h2>

      {/* Subtext */}
      {subtext !== undefined && (
        <p className="error-shell__subtext">{subtext}</p>
      )}

      {/* Action row — Retry first (D-pad default per spec §7.5) */}
      <div className="error-shell__actions">
        <Button
          variant="outlined"
          focusKey="ERROR_RETRY"
          onClick={onRetry}
          onEnterPress={onRetry}
        >
          {retryLabel}
        </Button>

        {onBack !== undefined && (
          <Button
            variant="ghost"
            focusKey="ERROR_BACK"
            onClick={onBack}
            onEnterPress={onBack}
          >
            {backLabel}
          </Button>
        )}
      </div>

      {/* Report — secondary, ghost, below main actions */}
      {onReport !== undefined && (
        <Button
          variant="ghost"
          focusKey="ERROR_REPORT"
          className="error-shell__report"
          onClick={onReport}
          onEnterPress={onReport}
        >
          Report issue
        </Button>
      )}
    </div>
  );
}
