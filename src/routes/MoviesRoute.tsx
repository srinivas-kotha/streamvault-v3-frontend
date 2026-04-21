/**
 * MoviesRoute — route shell for /movies (Task 2.3). Phase 5b replaces the body.
 */
import type { RefObject } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";

export function MoviesRoute() {
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_MOVIES" });
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="movies"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
        }}
      >
        <p style={{ color: "var(--text-primary)", padding: "48px" }}>
          Movies — coming in Phase 5b
        </p>
      </main>
    </FocusContext.Provider>
  );
}
