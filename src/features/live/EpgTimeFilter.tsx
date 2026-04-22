/**
 * EpgTimeFilter — time-of-day picker for the Live page (Task 4.4)
 *
 * Presents four preset buckets the user can D-pad between:
 *   - "all":   show all EPG entries
 *   - "now":   show entries airing at this moment
 *   - "next2": show entries starting within the next 2 hours
 *   - "tonight": show entries between 19:00 and 23:00 user-local time
 *
 * Per Q2, "no date" defaults to USER-LOCAL — we use `new Date()` and the
 * browser timezone, not UTC, so the filter matches the user's mental model
 * of their TV's clock.
 *
 * Each preset button registers with norigin via `useFocusable` and a stable
 * `focusKey: FILTER_<ID>` (D6a — Fire TV D-pad fails without per-button
 * registration; reference Task 2.4 dock incident).
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

export type EpgTimeFilterValue = "all" | "now" | "next2" | "tonight";

interface EpgTimeFilterOption {
  id: EpgTimeFilterValue;
  label: string;
}

const OPTIONS: EpgTimeFilterOption[] = [
  { id: "all", label: "All" },
  { id: "now", label: "Now" },
  { id: "next2", label: "Next 2 hrs" },
  { id: "tonight", label: "Tonight" },
];

export interface EpgTimeFilterProps {
  value: EpgTimeFilterValue;
  onChange: (next: EpgTimeFilterValue) => void;
}

export function EpgTimeFilter({ value, onChange }: EpgTimeFilterProps) {
  return (
    <div
      role="group"
      aria-label="EPG time filter"
      style={{
        display: "flex",
        gap: "var(--space-2)",
        alignItems: "center",
      }}
    >
      {OPTIONS.map((opt) => (
        <EpgFilterButton
          key={opt.id}
          option={opt}
          isActive={value === opt.id}
          onSelect={() => onChange(opt.id)}
        />
      ))}
    </div>
  );
}

function EpgFilterButton({
  option,
  isActive,
  onSelect,
}: {
  option: EpgTimeFilterOption;
  isActive: boolean;
  onSelect: () => void;
}) {
  // D6a: per-button useFocusable so norigin can build a spatial graph across
  // the toolbar. Without it, ArrowLeft/Right on Fire TV gets stuck.
  const { ref, focused } = useFocusable({
    focusKey: `FILTER_${option.id.toUpperCase()}`,
    onEnterPress: onSelect,
  });
  const active = isActive || focused;

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      className="focus-ring"
      aria-pressed={isActive}
      onClick={onSelect}
      style={{
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: active ? "var(--accent-copper)" : "var(--bg-surface)",
        color: active ? "var(--bg-base)" : "var(--text-secondary)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-tracking)",
        textTransform: "uppercase",
        cursor: "pointer",
        transition:
          "background var(--motion-focus), color var(--motion-focus)",
      }}
    >
      {option.label}
    </button>
  );
}

