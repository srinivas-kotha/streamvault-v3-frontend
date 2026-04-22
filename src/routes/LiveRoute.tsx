/**
 * LiveRoute — route shell for /live.
 *
 * Task 2.3: minimal shell + CONTENT_AREA_LIVE FocusContext provider so Esc
 * from BottomDock can route focus back into the content area.
 *
 * Task 4.3 (proof-of-life only): mount <SplitGuide> with an empty channel
 * list so the ErrorShell empty state renders. Full data wiring
 * (fetchChannels/fetchEpg, selectedChannelId useState, retry handler) lands
 * in Task 4.4. The empty-list ErrorShell is intentional — it proves the
 * component mounts under CONTENT_AREA_LIVE without the rest of the wiring.
 */
import type { RefObject } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import { SplitGuide } from "../features/live/SplitGuide";

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
        {/* Task 4.3 proof-of-life: empty channels → ErrorShell renders.
            Task 4.4 will replace these stubs with real fetch state. */}
        <SplitGuide
          channels={[]}
          selectedChannelId={null}
          onSelectChannel={() => {}}
          onRetry={() => {}}
        />
      </main>
    </FocusContext.Provider>
  );
}
