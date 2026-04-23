/**
 * Design tokens — TypeScript mirror of `src/brand/tokens.css`.
 *
 * CSS custom properties in `tokens.css` are the runtime source of truth;
 * this module exports the same values as typed constants for consumers
 * that need programmatic access (inline styles in JSX, computed geometry,
 * animation targets). Keep in sync when adding tokens to either file.
 *
 * Introduced with Phase 1 of the UX rebuild; maps directly to the 7-token
 * type scale and glass/focus system defined in
 * `docs/ux/00-ia-navigation.md` §6.7 / §6.8.
 */

/** 7-token type scale — single scale, every surface, no per-route overrides. */
export const type = {
  hero: {
    size: "48px",
    lineHeight: 1.1,
    weight: 700,
  },
  titleLg: {
    size: "32px",
    lineHeight: 1.2,
    weight: 600,
  },
  title: {
    size: "24px",
    lineHeight: 1.2,
    weight: 600,
  },
  body: {
    size: "20px",
    lineHeight: 1.4,
    weight: 500,
  },
  bodySm: {
    size: "16px",
    lineHeight: 1.4,
    weight: 400,
  },
  caption: {
    size: "14px",
    lineHeight: 1.3,
    weight: 500,
  },
  overline: {
    size: "12px",
    lineHeight: 1.2,
    weight: 600,
    tracking: "0.08em",
    transform: "uppercase" as const,
  },
} as const;

/** Glass/surface treatment — overlay surfaces only. */
export const glass = {
  toolbar: {
    background: "var(--glass-toolbar-bg)",
    backdropFilter: "var(--glass-toolbar-blur)",
    borderBottom: "var(--glass-toolbar-border)",
  },
  popover: {
    background: "var(--glass-popover-bg)",
    backdropFilter: "var(--glass-popover-blur)",
    border: "var(--glass-popover-border)",
    borderRadius: "var(--glass-popover-radius)",
  },
  sheet: {
    background: "var(--glass-sheet-bg)",
    backdropFilter: "var(--glass-sheet-blur)",
    borderTop: "var(--glass-sheet-border)",
    borderTopLeftRadius: "var(--glass-sheet-radius-top)",
    borderTopRightRadius: "var(--glass-sheet-radius-top)",
  },
  player: {
    background: "var(--glass-player-bg)",
    backdropFilter: "var(--glass-player-blur)",
  },
} as const;

/** Card surface (for Phase 2+ consumers — legacy `--bg-surface` stays intact). */
export const surface = {
  cardIdle: {
    background: "var(--surface-card-idle-bg)",
    border: "var(--surface-card-idle-border)",
  },
} as const;

/** Copper focus ring — one shadow, every focusable. */
export const focusRingShadow = "var(--focus-ring-shadow)";

/** Motion durations. */
export const motion = {
  focus: "var(--motion-focus)",
  page: "var(--motion-page)",
  dock: "var(--motion-dock)",
} as const;

/** Semantic colors. */
export const color = {
  bgBase: "var(--bg-base)",
  bgSurface: "var(--bg-surface)",
  bgElevated: "var(--bg-elevated)",
  accentCopper: "var(--accent-copper)",
  accentCopperDim: "var(--accent-copper-dim)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary: "var(--text-tertiary)",
  liveIndicator: "var(--live-indicator)",
  danger: "var(--danger)",
} as const;
