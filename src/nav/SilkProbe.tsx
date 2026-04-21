/**
 * SilkProbe — norigin spatial-navigation WebKit / Amazon Silk compatibility probe.
 *
 * Purpose: validate that norigin@2.1.0 correctly handles ArrowKey events on WebKit
 * (Playwright webkit project, iPad Pro UA). Kept as a permanent dev-time route.
 *
 * Route: /silk-probe (wired in App.tsx via simple pathname check)
 *
 * FIX: M1 — scoped import path; useFocusable destructures { ref, focusKey, focused, focusSelf }
 * (NOT FocusContext — FocusContext is a separate named export). FocusContext.Provider takes
 * value={focusKey} (a string), per norigin v2.1.0 README.
 */
import { useState, useEffect } from "react";
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";

// FIX: M1 — pass focusKey so Playwright can assert TL/TR/BL/BR transitions; make a real
// focusable button so document.activeElement reflects the navigation target (native focus).
function ProbeCard({ label }: { label: string }) {
  const { ref, focused } = useFocusable({ focusKey: label });
  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      // aria-label stays as the plain label so Playwright can assert
      // document.activeElement?.getAttribute("aria-label") === "TL" etc.
      aria-label={label}
      tabIndex={-1}
      style={{
        width: 200,
        height: 120,
        background: focused ? "var(--accent-copper)" : "var(--bg-surface)",
        color: "var(--text-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--text-body-lg-size)",
        transition: "background var(--motion-focus)",
        border: "none",
        cursor: "pointer",
      }}
    >
      {focused ? `✓ ${label}` : label}
    </button>
  );
}

export function SilkProbe() {
  const [log, setLog] = useState<string[]>([]);
  // FIX: M1 — useFocusable returns { ref, focusKey, focusSelf, ... }; focus self on mount
  // so the Playwright assertions have a deterministic starting focus (TL).
  const { ref, focusKey, focusSelf } = useFocusable({
    focusKey: "SILK-PROBE",
  });

  useEffect(() => {
    // focusSelf() focuses the SILK-PROBE container and passes focus to first child.
    // setFocus('TL') is more explicit and deterministic for the Playwright probe gate —
    // it directly targets the TL card after all children have registered with norigin.
    focusSelf();
    setFocus("TL");
    const handler = (e: KeyboardEvent) => {
      setLog((prev) =>
        [`key: ${e.key} | code: ${e.code}`, ...prev].slice(0, 20),
      );
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusSelf]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={ref}
        style={{
          padding: "48px",
          background: "var(--bg-base)",
          minHeight: "100vh",
        }}
      >
        <h2
          style={{
            color: "var(--text-primary)",
            fontSize: "var(--text-title-size)",
            marginBottom: "24px",
          }}
        >
          Silk Probe — D-pad to navigate tiles
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 200px)",
            gap: "16px",
          }}
        >
          <ProbeCard label="TL" />
          <ProbeCard label="TR" />
          <ProbeCard label="BL" />
          <ProbeCard label="BR" />
        </div>
        <pre
          style={{
            color: "var(--text-secondary)",
            marginTop: "32px",
            fontSize: "14px",
          }}
        >
          {log.join("\n")}
        </pre>
      </div>
    </FocusContext.Provider>
  );
}
