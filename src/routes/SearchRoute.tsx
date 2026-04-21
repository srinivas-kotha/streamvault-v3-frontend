/**
 * SearchRoute — route shell for /search (Task 2.3). Phase 7 replaces the body.
 */
import type { RefObject } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";

export function SearchRoute() {
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_SEARCH" });
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="search"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
        }}
      >
        <p style={{ color: "var(--text-primary)", padding: "48px" }}>
          Search — coming in Phase 7
        </p>
      </main>
    </FocusContext.Provider>
  );
}
