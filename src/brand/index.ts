/**
 * Oxide design token constants — type-safe JS mirror of tokens.css CSS vars.
 *
 * Source: design spec §6 (2026-04-15-streamvault-v3-design.md)
 *         plan Task 1.1 Step 3 (2026-04-15-streamvault-v3-implementation.md)
 *
 * Use these constants for programmatic access (e.g. hls.js colour config,
 * canvas rendering, unit tests). For styling, always prefer the CSS vars
 * (--sv-*) so that the cascade and media queries work correctly.
 *
 * FIX M7: textSecondary opacity raised from 0.65 → 0.80 to guarantee
 * WCAG AA ≥4.5:1 contrast on --sv-bg-base (composite ≈ 9.83:1).
 */
export const OXIDE = {
  // Backgrounds
  bgBase: "#12100E",
  bgSurface: "#1E1A16",
  bgElevated: "#2A2520",

  // Accent — Oxide copper
  accentCopper: "#C87941",
  accentCopperDim: "#A35F2E",

  // Text
  textPrimary: "#EDE4D3",
  textSecondary: "rgba(237,228,211,0.8)",
  textTertiary: "rgba(237,228,211,0.4)",

  // Semantic
  liveIndicator: "#E85A2B",
  danger: "#D84343",

  // Spacing — 8px base grid
  spacingBase: 8,
} as const;

export type OxideToken = typeof OXIDE;
