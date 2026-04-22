/**
 * SettingsRoute — /settings page (Phase 8).
 *
 * Surfaces:
 *  - My Favorites  → /favorites
 *  - Watch History → /history
 *
 * BottomDock keeps its 5-item shape (Live/Movies/Series/Search/Settings)
 * unchanged per design constraint. Favorites and History are accessible
 * here rather than as new dock entries. This is the cleaner path because
 * TV remotes work best with a stable, memorisable dock layout.
 */
import type { RefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";

interface SettingsMenuItemProps {
  focusKey: string;
  icon: string;
  label: string;
  description: string;
  onSelect: () => void;
}

function SettingsMenuItem({
  focusKey,
  icon,
  label,
  description,
  onSelect,
}: SettingsMenuItemProps) {
  const { ref, focused } = useFocusable({ focusKey, onEnterPress: onSelect });

  return (
    <li style={{ listStyle: "none" }}>
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        onClick={onSelect}
        className="focus-ring"
        aria-label={label}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          padding: "var(--space-4) var(--space-5)",
          background: focused ? "var(--accent-copper)" : "var(--bg-surface)",
          color: focused ? "var(--bg-base)" : "var(--text-primary)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          textAlign: "left",
          transition:
            "background var(--motion-focus), color var(--motion-focus)",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 24, minWidth: 32 }}>
          {icon}
        </span>
        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: "var(--text-body-size)",
            }}
          >
            {label}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-label-size)",
              opacity: 0.75,
              marginTop: 2,
            }}
          >
            {description}
          </p>
        </div>
        <span aria-hidden="true" style={{ opacity: 0.5 }}>
          ›
        </span>
      </button>
    </li>
  );
}

export function SettingsRoute() {
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_SETTINGS" });
  const navigate = useNavigate();

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="settings"
        tabIndex={-1}
        style={{
          padding: "var(--space-6)",
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
        }}
      >
        <h1
          style={{
            fontSize: "var(--text-title-size)",
            color: "var(--text-primary)",
            margin: "0 0 var(--space-6) 0",
            fontWeight: 700,
          }}
        >
          Settings
        </h1>

        <ul
          aria-label="Settings menu"
          style={{
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            maxWidth: 600,
          }}
        >
          <SettingsMenuItem
            focusKey="SETTINGS_FAVORITES"
            icon="★"
            label="My Favorites"
            description="Channels, movies, and series you've starred"
            onSelect={() => navigate("/favorites")}
          />
          <SettingsMenuItem
            focusKey="SETTINGS_HISTORY"
            icon="▶"
            label="Watch History"
            description="Recently watched content with resume positions"
            onSelect={() => navigate("/history")}
          />
        </ul>
      </main>
    </FocusContext.Provider>
  );
}
