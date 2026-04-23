/**
 * FindInput — in-route filter input for /movies and /series.
 *
 * Always rendered in the DOM (keeps the layout stable + tests predictable),
 * but D-pad only lands on it when the caller explicitly invokes it via a
 * "🔍 Find" trigger chip (see FindTrigger). This keeps browsing users from
 * having the input steal focus every time they traverse the page.
 *
 * Escape or Backspace on an empty input clears the filter and returns focus
 * to the find-trigger chip.
 */
import type { RefObject } from "react";
import {
  useFocusable,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";

interface FindInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Unique suffix used by the route to namespace the focusKey. e.g. "MOVIES". */
  surface: "MOVIES" | "SERIES";
  placeholder: string;
}

export function FindInput({
  value,
  onChange,
  surface,
  placeholder,
}: FindInputProps) {
  const focusKey = `${surface}_FIND_INPUT`;
  const triggerKey = `${surface}_FIND_TRIGGER`;

  const { ref, focused } = useFocusable<HTMLInputElement>({
    focusKey,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" || (e.key === "Backspace" && value.length === 0)) {
      e.preventDefault();
      e.stopPropagation();
      onChange("");
      setFocus(triggerKey);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-6)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: "var(--text-secondary)",
          fontSize: "var(--text-body-size)",
        }}
      >
        🔍
      </span>
      <input
        ref={ref as RefObject<HTMLInputElement>}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-label={placeholder}
        data-testid={`${surface.toLowerCase()}-find-input`}
        style={{
          flex: 1,
          maxWidth: 420,
          background: "var(--bg-surface)",
          border: focused
            ? "2px solid var(--accent-copper)"
            : "2px solid var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          fontSize: "var(--text-body-size)",
          padding: "var(--space-2) var(--space-3)",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {value.length > 0 && (
        <ClearButton
          onClick={() => {
            onChange("");
            setFocus(triggerKey);
          }}
          surface={surface}
        />
      )}
    </div>
  );
}

function ClearButton({
  onClick,
  surface,
}: {
  onClick: () => void;
  surface: "MOVIES" | "SERIES";
}) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: `${surface}_FIND_CLEAR`,
    onEnterPress: onClick,
  });
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-label="Clear filter"
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: "var(--radius-sm)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid transparent",
        background: focused ? "var(--bg-elevated)" : "var(--bg-surface)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        fontSize: 18,
        lineHeight: 1,
      }}
    >
      ×
    </button>
  );
}

interface FindTriggerProps {
  surface: "MOVIES" | "SERIES";
  onSelect: () => void;
  isActive: boolean;
}

export function FindTrigger({ surface, onSelect, isActive }: FindTriggerProps) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: `${surface}_FIND_TRIGGER`,
    onEnterPress: onSelect,
  });
  const active = isActive || focused;
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-label={`Find in ${surface.toLowerCase()}`}
      aria-pressed={isActive}
      onClick={onSelect}
      className="focus-ring"
      style={{
        padding: "var(--space-2) var(--space-3)",
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
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
      }}
    >
      🔍 Find
    </button>
  );
}

/**
 * Substring filter helper — tokenizes query on whitespace and requires every
 * token to appear (case-insensitive) in `fields`. Shared between MoviesRoute
 * and SeriesRoute for identical filter semantics.
 */
export function filterByQuery<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => string,
): T[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return [...items];
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...items];
  return items.filter((it) => {
    const haystack = getFields(it).toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
