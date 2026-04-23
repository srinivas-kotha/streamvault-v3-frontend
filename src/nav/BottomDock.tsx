// FIX: M1 — scoped import; FocusContext is a separate named export (not returned by useFocusable).
import {
  useFocusable,
  FocusContext,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";

export type DockItem = "live" | "movies" | "series" | "search" | "settings";

const DOCK_ITEMS: { id: DockItem; label: string; icon: string }[] = [
  { id: "movies", label: "Movies", icon: "▶" },
  { id: "series", label: "Series", icon: "⊞" },
  { id: "live", label: "Live", icon: "●" },
  { id: "search", label: "Search", icon: "⌕" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

interface BottomDockProps {
  activeItem: DockItem;
  onNavigate: (item: DockItem) => void;
  hidden?: boolean;
}

export function BottomDock({
  activeItem,
  onNavigate,
  hidden = false,
}: BottomDockProps) {
  // FIX: M1 — useFocusable returns { ref, focusKey, focused, focusSelf, ... };
  // pass focusKey (a string) to FocusContext.Provider value.
  // isFocusBoundary absorbs dead-direction bubble-ups at the dock's edges —
  // Left on the leftmost tab, Right on the rightmost, Down (nothing below).
  // Without this, norigin's smartNavigate recurses up to SN:ROOT and in some
  // layouts lands on setFocus(undefined), blurring the current tab and
  // leaving currentFocusKey null (see streamvault-v3-focus-vanish-bug.md).
  // Up is not a boundary: DockTab's onArrowPress handles Up explicitly via
  // setFocus(CONTENT_AREA_*) and returns false to block default navigation.
  const { ref, focusKey } = useFocusable({
    focusKey: "DOCK",
    isFocusBoundary: true,
    focusBoundaryDirections: ["left", "right", "down"],
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <nav
        ref={ref}
        aria-label="Main navigation"
        style={{
          position: "fixed",
          bottom: "var(--dock-bottom-offset, var(--space-6))",
          left: "var(--safe-inset)",
          right: "var(--safe-inset)",
          // Task 2.3 follow-up A: iOS/Android safe-area inset so the dock clears notches.
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          height: "var(--dock-height)",
          // Polish: floating control bar — darker glass, copper top edge
          background: "var(--dock-glass-bg, rgba(18,16,14,0.85))",
          borderTop: "var(--dock-top-border, 1px solid rgba(200,121,65,0.18))",
          borderRadius: "var(--radius-pill)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          padding: "0 var(--dock-h-padding, var(--space-8))",
          opacity: hidden ? 0 : 1,
          pointerEvents: hidden ? "none" : "auto",
          transition: "opacity var(--motion-dock)",
          zIndex: 100,
        }}
      >
        <div
          role="tablist"
          aria-label="Navigation"
          style={{
            display: "flex",
            gap: "var(--space-4)",
            width: "100%",
            justifyContent: "space-around",
          }}
        >
          {DOCK_ITEMS.map((item) => (
            <DockTab
              key={item.id}
              item={item}
              isActive={activeItem === item.id}
              activeItem={activeItem}
              onSelect={() => onNavigate(item.id)}
            />
          ))}
        </div>
      </nav>
    </FocusContext.Provider>
  );
}

function DockTab({
  item,
  isActive,
  activeItem,
  onSelect,
}: {
  item: (typeof DOCK_ITEMS)[0];
  isActive: boolean;
  activeItem: DockItem;
  onSelect: () => void;
}) {
  // Task 2.4: explicit focusKey per tab. Without this, norigin can't uniquely
  // identify siblings under DOCK, so ArrowRight can't route spatial focus —
  // verified via E2E debug (pre-fix, ArrowRight stayed on the initial tab).
  //
  // 2026-04-22 followup: norigin's geometric ArrowUp from the dock only finds
  // a candidate above when content-area focusables are already registered.
  // Race window: initial paint + data fetch + useEffect registration can take
  // a second or two, and during that window ArrowUp is a no-op — the user
  // feels stuck. Handle ArrowUp explicitly: setFocus to the active route's
  // CONTENT_AREA_* container, which has trackChildren:true so norigin forwards
  // focus into the grid/list instead of staying pinned on the dock.
  //
  // 2026-04-23 fix: target CONTENT_AREA_{activeItem}, not {item.id}. When the
  // user ArrowRight's to hover a different tab WITHOUT pressing Enter, the
  // hovered tab's route isn't mounted — calling setFocus on an unmounted key
  // silently fails AND corrupts norigin's focus state (subsequent arrows
  // stop working). Always target the mounted route's content area.
  const { ref, focused } = useFocusable({
    focusKey: `DOCK_${item.id.toUpperCase()}`,
    onEnterPress: onSelect,
    onArrowPress: (direction) => {
      if (direction === "up") {
        setFocus(`CONTENT_AREA_${activeItem.toUpperCase()}`);
        return false; // consume the event — we've handled it
      }
      return true; // let norigin handle left/right/down
    },
  });
  const active = isActive || focused;

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      role="tab"
      aria-selected={isActive}
      aria-label={item.label}
      onClick={onSelect}
      className="focus-ring"
      style={{
        // Active: copper fill + light-sweep gradient for depth. Inactive: transparent.
        background: active
          ? `var(--accent-copper)`
          : "transparent",
        // Light-sweep layered on top for active tabs (depth without extra element)
        backgroundImage: active
          ? "var(--dock-tab-active-gradient, linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 100%))"
          : "none",
        color: active ? "var(--bg-base)" : "var(--text-secondary)",
        border: "none",
        borderRadius: "var(--radius-sm)",
        padding:
          "var(--dock-tab-v-padding, var(--space-2)) var(--space-4)",
        cursor: "pointer",
        fontSize: "var(--dock-label-size, var(--text-label-size))",
        fontWeight: active ? 600 : 400,
        transition:
          "background var(--motion-focus), color var(--motion-focus), box-shadow var(--motion-focus)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--dock-tab-gap, 4px)",
        minWidth: "var(--dock-tab-min-width, 80px)",
      }}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: "var(--dock-icon-size, 20px)" }}
      >
        {item.icon}
      </span>
      <span
        style={{
          fontSize: "var(--dock-label-size, var(--text-label-size))",
          letterSpacing: "var(--text-label-tracking)",
          textTransform: "uppercase",
        }}
      >
        {item.label}
      </span>
    </button>
  );
}
