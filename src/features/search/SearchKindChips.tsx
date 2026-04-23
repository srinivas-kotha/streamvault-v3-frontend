/**
 * SearchKindChips — All · Live · Movies · Series segmented control.
 *
 * Client-side section filter for the Search route. Does NOT re-fetch;
 * just hides/shows sections. Session-only (no persistence) per the
 * search-favorites UX spec.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

export type SearchKind = "all" | "live" | "vod" | "series";

interface ChipProps {
  kind: SearchKind;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}

function Chip({ kind, label, isActive, onSelect }: ChipProps) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: `SEARCH_KIND_${kind.toUpperCase()}`,
    onEnterPress: onSelect,
  });
  const active = isActive || focused;
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={onSelect}
      className="focus-ring"
      style={{
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: active ? "var(--accent-copper)" : "var(--bg-surface)",
        color: active ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-tracking)",
        textTransform: "uppercase",
        cursor: "pointer",
        transition:
          "background var(--motion-focus), color var(--motion-focus)",
      }}
    >
      {label}
    </button>
  );
}

const CHIPS: { kind: SearchKind; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "vod", label: "Movies" },
  { kind: "series", label: "Series" },
  { kind: "live", label: "Live" },
];

interface SearchKindChipsProps {
  value: SearchKind;
  onChange: (kind: SearchKind) => void;
}

export function SearchKindChips({ value, onChange }: SearchKindChipsProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Filter search results by type"
      style={{
        display: "flex",
        gap: "var(--space-2)",
        padding: "0 var(--space-6) var(--space-4)",
      }}
    >
      {CHIPS.map((c) => (
        <Chip
          key={c.kind}
          kind={c.kind}
          label={c.label}
          isActive={value === c.kind}
          onSelect={() => onChange(c.kind)}
        />
      ))}
    </div>
  );
}
