// FIX: M1 — scoped import; FocusContext is a separate named export (not returned by useFocusable).
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";

export type DockItem = "live" | "movies" | "series" | "search" | "settings";

const DOCK_ITEMS: { id: DockItem; label: string; icon: string }[] = [
  { id: "live", label: "Live", icon: "●" },
  { id: "movies", label: "Movies", icon: "▶" },
  { id: "series", label: "Series", icon: "⊞" },
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
  const { ref, focusKey } = useFocusable({ focusKey: "DOCK" });

  return (
    <FocusContext.Provider value={focusKey}>
      <nav
        ref={ref}
        aria-label="Main navigation"
        style={{
          position: "fixed",
          bottom: "var(--space-6)",
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
          padding: "0 var(--space-8)",
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
  onSelect,
}: {
  item: (typeof DOCK_ITEMS)[0];
  isActive: boolean;
  onSelect: () => void;
}) {
  // Task 2.4: explicit focusKey per tab. Without this, norigin can't uniquely
  // identify siblings under DOCK, so ArrowRight can't route spatial focus —
  // verified via E2E debug (pre-fix, ArrowRight stayed on the initial tab).
  const { ref, focused } = useFocusable({
    focusKey: `DOCK_${item.id.toUpperCase()}`,
    onEnterPress: onSelect,
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
        padding: "var(--space-2) var(--space-4)",
        cursor: "pointer",
        fontSize: "var(--text-body-size)",
        fontWeight: active ? 600 : 400,
        transition:
          "background var(--motion-focus), color var(--motion-focus), box-shadow var(--motion-focus)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        minWidth: "80px",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: "20px" }}>
        {item.icon}
      </span>
      <span
        style={{
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-tracking)",
          textTransform: "uppercase",
        }}
      >
        {item.label}
      </span>
    </button>
  );
}
