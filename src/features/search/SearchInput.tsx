/**
 * SearchInput — TV-friendly search text input.
 *
 * Wires norigin useFocusable to the <input> element. Enter key triggers
 * onSubmit via onEnterPress (norigin intercepts Enter at window level so
 * native form submit does NOT fire — LoginPage pattern).
 *
 * Copper outline applied when norigin-focused.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function SearchInput({ value, onChange, onSubmit }: SearchInputProps) {
  const { ref, focused } = useFocusable<HTMLInputElement>({
    focusKey: "SEARCH_INPUT",
    onEnterPress: onSubmit,
  });

  return (
    <div
      style={{
        padding: "var(--space-6) var(--space-6) var(--space-4)",
      }}
    >
      <label
        htmlFor="search-input"
        style={{
          display: "block",
          color: "var(--text-secondary)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-tracking)",
          textTransform: "uppercase",
          marginBottom: "var(--space-2)",
        }}
      >
        Search
      </label>
      <input
        id="search-input"
        ref={ref as RefObject<HTMLInputElement>}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type to search…"
        autoComplete="off"
        spellCheck={false}
        aria-label="Search channels, movies, and series"
        style={{
          width: "100%",
          maxWidth: 640,
          background: "var(--bg-surface)",
          border: focused
            ? "2px solid var(--accent-copper)"
            : "2px solid var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          fontSize: "var(--text-body-lg-size, 24px)",
          padding: "var(--space-3) var(--space-4)",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
