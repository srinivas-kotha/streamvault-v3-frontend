/**
 * ResumeHero — full-width "Resume <Title>" CTA above the LanguageRail.
 *
 * Spec: UX-Lead recommendation 2026-04-23 — supersedes the Continue-watching
 * chip's placement inside the LanguageRail on /movies (00-ia §6.1). Rationale:
 *   - A resume action belongs in action real estate, not filter real estate.
 *   - Hero is its own row → chip appearance doesn't mutate rail width mid-row.
 *   - Cold-open budget drops from 3 inputs (chip → Enter) to 2 (hero → Enter),
 *     matching the "mount → Enter plays" philosophy for the landing route.
 *
 * Ripple to /series and /live is pending Phase 3/4 design — for now the hero
 * pattern is Movies-only and the chip stays out of the Movies rail.
 *
 * Focus: `RESUME_HERO`. On cold mount with a resume candidate, the route
 * seeds focus here instead of the first poster.
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

export interface ResumeHeroProps {
  title: string;
  /** Seconds remaining in the movie (duration − progress). */
  remainingSeconds: number;
  onSelect: () => void;
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "almost done";
  if (seconds < 60) return "<1m left";
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours}h left` : `${hours}h ${rem}m left`;
}

export function ResumeHero({
  title,
  remainingSeconds,
  onSelect,
}: ResumeHeroProps) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey: "RESUME_HERO",
    onEnterPress: onSelect,
  });

  return (
    <div
      style={{
        padding: "var(--space-4) var(--space-6) var(--space-2)",
      }}
    >
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        aria-label={`Resume ${title} — ${formatRemaining(remainingSeconds)}`}
        onClick={onSelect}
        className="focus-ring"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          width: "100%",
          padding: "var(--space-4) var(--space-6)",
          borderRadius: "var(--radius-md, 12px)",
          border: focused
            ? "2px solid var(--accent-copper)"
            : "2px solid rgba(200, 121, 65, 0.35)",
          background: focused
            ? "var(--accent-copper)"
            : "linear-gradient(90deg, rgba(200, 121, 65, 0.22), rgba(200, 121, 65, 0.08))",
          color: focused ? "var(--bg-base)" : "var(--text-primary)",
          cursor: "pointer",
          textAlign: "left",
          boxShadow: focused
            ? "0 0 0 2px var(--accent-copper), 0 12px 40px -12px rgba(200, 121, 65, 0.6)"
            : "0 4px 16px rgba(0, 0, 0, 0.35)",
          transition:
            "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus), box-shadow var(--motion-focus)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontSize: 28,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ▶
        </span>
        <span
          style={{
            flex: 1,
            fontSize: "var(--type-body-lg, 18px)",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          Resume {title}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: "var(--text-body-size)",
            opacity: focused ? 0.85 : 0.7,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatRemaining(remainingSeconds)}
        </span>
      </button>
    </div>
  );
}
