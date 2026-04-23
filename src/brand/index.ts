/**
 * Oxide design token constants — type-safe JS mirror of tokens.css CSS vars.
 *
 * Source: design spec §6 (2026-04-15-streamvault-v3-design.md)
 *         plan Task 1.1 Step 3 (2026-04-15-streamvault-v3-implementation.md)
 *
 * Use these constants for programmatic access (e.g. hls.js colour config,
 * canvas rendering, unit tests). For styling, always prefer the bare CSS vars
 * (e.g. var(--bg-base), var(--accent-copper), var(--space-4)) so that the
 * cascade, media queries, and prefers-reduced-motion overrides work correctly.
 *
 * Only colours and the 8-px base grid are mirrored here; spacing steps, radii,
 * typography, motion, and layout remain CSS-only — consume them via
 * `var(--space-4)`, `var(--radius-md)`, etc.
 *
 * FIX M7: textSecondary opacity raised from 0.65 → 0.80 to guarantee
 * WCAG AA ≥4.5:1 contrast on --bg-base (composite ≈ 9.83:1).
 *
 * Lockstep note (PR #6 code-review I1 / M1): hex literals and rgba() string
 * form are kept byte-identical to tokens.css so `grep -n '#12100e' src/brand/`
 * or `grep -n 'rgba(237, 228, 211, 0.8)' src/brand/` matches both files.
 * Hex is lowercase because Prettier 3.8.3 forces CSS hex to lowercase on every
 * save and has no `hexCase` option — mirroring lowercase in TS is the only
 * direction that survives the auto-format hook.
 */
export const OXIDE = {
  // Backgrounds
  bgBase: "#12100e",
  bgSurface: "#1e1a16",
  bgElevated: "#2a2520",

  // Accent — Oxide copper
  accentCopper: "#c87941",
  accentCopperDim: "#a35f2e",

  // Text
  textPrimary: "#ede4d3",
  textSecondary: "rgba(237, 228, 211, 0.8)",
  textTertiary: "rgba(237, 228, 211, 0.4)",

  // Semantic
  liveIndicator: "#e85a2b",
  danger: "#d84343",
  success: "#4caf88",
  warning: "#f59e0b",

  // Spacing — 8px base grid
  spacingBase: 8,
} as const;

export type OxideToken = typeof OXIDE;
