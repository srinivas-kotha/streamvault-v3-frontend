/**
 * LiveRoute — route shell for /live (Task 2.3).
 *
 * Minimal shell with CONTENT_AREA_LIVE focus provider so future Esc-key logic
 * can route focus out of BottomDock via setFocus("CONTENT_AREA_LIVE").
 * Phase 4 replaces the placeholder body with Live TV channel grid + EPG.
 */
import type { RefObject } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";

export function LiveRoute() {
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_LIVE" });
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="live"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
        }}
      >
        <p style={{ color: "var(--text-primary)", padding: "48px" }}>
          Live TV — coming in Phase 4
        </p>
      </main>
    </FocusContext.Provider>
  );
}
