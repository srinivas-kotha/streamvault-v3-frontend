/**
 * LanguageRail — global language filter chip strip.
 *
 * Shared across Live, Movies, and Series routes.
 * Each chip registers with norigin via useFocusable.
 *
 * Props:
 *   value            — currently active language id (controlled)
 *   onChange         — called when user selects a chip
 *   showSports       — render the Sports chip (Live only; default false)
 *   continueWatching — when truthy, renders a leading ContinueWatchingChip
 *                      (conditional per spec §6.1 — only show when history ≥ 1)
 *   className        — optional extra CSS class on the wrapper div
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { LangId } from "../lib/langPref";
import { ContinueWatchingChip } from "./ContinueWatchingChip";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LanguageOption {
  id: LangId;
  label: string;
}

// Base chips present on every surface.
const BASE_OPTIONS: LanguageOption[] = [
  { id: "telugu", label: "Telugu" },
  { id: "hindi", label: "Hindi" },
  { id: "english", label: "English" },
  { id: "all", label: "All" },
];

// Sports chip is Live-specific (no sports-category concept on VOD/Series).
const SPORTS_OPTION: LanguageOption = { id: "sports", label: "Sports" };

// ─── Chip component ──────────────────────────────────────────────────────────

interface ChipProps {
  option: LanguageOption;
  isActive: boolean;
  onSelect: () => void;
}

function LanguageChip({ option, isActive, onSelect }: ChipProps) {
  const { ref, focused } = useFocusable({
    focusKey: `LANG_${option.id.toUpperCase()}`,
    onEnterPress: onSelect,
  });
  const active = isActive || focused;

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-label={option.label}
      onClick={onSelect}
      className="focus-ring"
      style={{
        padding: "var(--space-2) var(--space-5)",
        borderRadius: "var(--radius-pill)",
        border: isActive
          ? "2px solid var(--accent-copper)"
          : "2px solid transparent",
        background: active ? "var(--accent-copper)" : "var(--bg-surface)",
        color: active ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-body-size)",
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      {option.label}
    </button>
  );
}

// ─── LanguageRail ─────────────────────────────────────────────────────────────

interface ContinueWatchingConfig {
  /** Fires when the user activates the Continue-watching chip. */
  onSelect: () => void;
  /** Accessible label + button text. Default: "Continue watching". */
  label?: string;
}

interface LanguageRailProps {
  value: LangId;
  onChange: (lang: LangId) => void;
  /** Show the Sports chip (Live TV only). Default: false */
  showSports?: boolean;
  /**
   * When provided, renders a Continue-watching chip as the leading slot.
   * Callers must gate on history ≥ 1 (pass `null`/`undefined` otherwise) —
   * the rail itself does not inspect history.
   */
  continueWatching?: ContinueWatchingConfig | null;
  className?: string;
}

export function LanguageRail({
  value,
  onChange,
  showSports = false,
  continueWatching,
  className,
}: LanguageRailProps) {
  // Build the ordered option list; insert Sports after English when shown.
  const options: LanguageOption[] = showSports
    ? [
        { id: "telugu", label: "Telugu" },
        { id: "hindi", label: "Hindi" },
        { id: "english", label: "English" },
        SPORTS_OPTION,
        { id: "all", label: "All" },
      ]
    : BASE_OPTIONS;

  return (
    <div
      role="radiogroup"
      aria-label="Filter by language"
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-3)",
        padding: "var(--space-4) var(--space-6) var(--space-2)",
      }}
    >
      {continueWatching ? (
        continueWatching.label !== undefined ? (
          <ContinueWatchingChip
            onSelect={continueWatching.onSelect}
            label={continueWatching.label}
          />
        ) : (
          <ContinueWatchingChip onSelect={continueWatching.onSelect} />
        )
      ) : null}
      {options.map((opt) => (
        <LanguageChip
          key={opt.id}
          option={opt}
          isActive={value === opt.id}
          onSelect={() => onChange(opt.id)}
        />
      ))}
    </div>
  );
}
