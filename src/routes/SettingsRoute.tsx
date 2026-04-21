/**
 * SettingsRoute — route shell for /settings (Task 2.3). Phase 8 replaces the body.
 */
import type { RefObject } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";

export function SettingsRoute() {
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_SETTINGS" });
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="settings"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
        }}
      >
        <p style={{ color: "var(--text-primary)", padding: "48px" }}>
          Settings — coming in Phase 8
        </p>
      </main>
    </FocusContext.Provider>
  );
}
