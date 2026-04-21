/**
 * SeriesRoute — route shell for /series (Task 2.3). Phase 6 replaces the body.
 */
import type { RefObject } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";

export function SeriesRoute() {
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_SERIES" });
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="series"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
        }}
      >
        <p style={{ color: "var(--text-primary)", padding: "48px" }}>
          Series — coming in Phase 6
        </p>
      </main>
    </FocusContext.Provider>
  );
}
