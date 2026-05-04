/**
 * DormantContentOverlay — shown when the backend returns HTTP 410 DORMANT.
 *
 * A 410 from stream.router.ts means: the master content_uid record exists in
 * sv_content_master, but there is no matching row in sv_content_provider_map for
 * the active provider (xtream:8027e2a2). The title exists in the library but the
 * current provider doesn't carry it.
 *
 * Design intent (matches FailureOverlay visual language from PlayerShell):
 *  - Full-screen dark overlay over the player area
 *  - Teal/indigo glow icon (brand Ambient Depth palette)
 *  - Copper accent on the dismiss button hover/focus state
 *  - D-pad focusable dismiss button via norigin useFocusable
 *  - role=alertdialog for screen-reader accessibility
 *  - NO retry button — the content isn't a transient error, it's a library gap
 */
import type { RefObject } from "react";
import { useEffect } from "react";
import {
  useFocusable,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";

const FK_DORMANT_DISMISS = "DORMANT_OVERLAY_DISMISS";

interface DormantContentOverlayProps {
  onDismiss: () => void;
}

export function DormantContentOverlay({
  onDismiss,
}: DormantContentOverlayProps) {
  const { ref, focused } = useFocusable({
    focusKey: FK_DORMANT_DISMISS,
    onEnterPress: onDismiss,
  });

  // Auto-focus the dismiss button on mount.
  useEffect(() => {
    setFocus(FK_DORMANT_DISMISS);
  }, []);

  // Escape/Back dismisses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Back" || e.key === "GoBack") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDismiss]);

  return (
    <div
      data-testid="dormant-content-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label="Content unavailable on current provider"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.82)",
        padding: "var(--space-6)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          background:
            "color-mix(in srgb, var(--accent-teal, #2DD4A8) 8%, var(--bg-card, #1a1a2e))",
          border:
            "1px solid color-mix(in srgb, var(--accent-teal, #2DD4A8) 40%, transparent)",
          borderRadius: "var(--radius-md, 12px)",
          padding: "var(--space-8, 2rem) var(--space-6, 1.5rem)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-4, 1rem)",
          textAlign: "center",
          color: "var(--text-primary, #EDE4D3)",
          boxShadow:
            "0 0 32px color-mix(in srgb, var(--accent-teal, #2DD4A8) 15%, transparent)",
        }}
      >
        {/* Teal library / content icon */}
        <span
          aria-hidden="true"
          style={{
            fontSize: "40px",
            lineHeight: 1,
            filter:
              "drop-shadow(0 0 8px color-mix(in srgb, var(--accent-teal, #2DD4A8) 60%, transparent))",
          }}
        >
          📚
        </span>

        <p
          style={{
            fontSize: "var(--text-title-size, 1.125rem)",
            fontWeight: 600,
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          This title isn't on your current provider yet.
        </p>

        <p
          style={{
            color: "var(--text-secondary, rgba(237,228,211,0.7))",
            fontSize: "var(--text-body-size, 0.9375rem)",
            margin: 0,
            lineHeight: 1.6,
            maxWidth: "400px",
          }}
        >
          We'll bring it back when the source returns. In the meantime, try
          exploring other titles you might enjoy.
        </p>

        <button
          ref={ref as RefObject<HTMLButtonElement>}
          type="button"
          className="focus-ring"
          onClick={onDismiss}
          style={{
            marginTop: "var(--space-2, 0.5rem)",
            background: focused
              ? "var(--accent-copper, #C87941)"
              : "rgba(255,255,255,0.12)",
            color: focused
              ? "var(--bg-base, #12100e)"
              : "var(--text-primary, #EDE4D3)",
            border: "none",
            borderRadius: "var(--radius-sm, 8px)",
            padding: "var(--space-2, 0.5rem) var(--space-6, 1.5rem)",
            cursor: "pointer",
            fontSize: "var(--text-body-size, 0.9375rem)",
            fontWeight: 500,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          Back to browse
        </button>
      </div>
    </div>
  );
}
