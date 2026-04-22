/**
 * OverflowMenu — a visible ⋯ trigger button + D-pad-navigable overlay menu.
 *
 * Replaces long-press / OK-hold across Series and Movies surfaces (#58).
 *
 * D-pad contract:
 *  - `⋯` trigger is a standard norigin useFocusable button.
 *  - OK / Enter on trigger → opens overlay, auto-focuses first item.
 *  - Up / Down inside open menu → cycles items (browser focus order).
 *  - Escape → closes menu, returns focus to trigger.
 *  - Click-outside → closes menu, returns focus to trigger.
 *
 * Props:
 *  - actions  — menu items to render.
 *  - focusKey — norigin focusKey for the trigger button (caller supplies;
 *               e.g. `EPISODE_OVERFLOW_${ep.id}` or `MOVIE_OVERFLOW_${id}`).
 *  - triggerLabel — accessible aria-label for the ⋯ button (default "More actions").
 *  - placement — where the menu appears relative to the trigger (default "below").
 */
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";

export interface OverflowAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface OverflowMenuProps {
  actions: OverflowAction[];
  focusKey: string;
  triggerLabel?: string;
  placement?: "right" | "below";
}

export function OverflowMenu({
  actions,
  focusKey,
  triggerLabel = "More actions",
  placement = "below",
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  // Separate DOM ref for returning focus after close (noriginRef is the
  // focusable ref owned by norigin — we must not mutate its .current).
  const domRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { ref: noriginRef, focused } = useFocusable<HTMLButtonElement>({
    focusKey,
    onEnterPress: () => {
      setOpen((prev) => !prev);
    },
  });

  // Assign both refs to the button without mutating noriginRef.current.
  // We pass noriginRef as the primary ref prop and sync domRef via a
  // callback on the wrapping element (see <div ref={…}> below) — or
  // simply keep a separate ref on a wrapping div and query the button.
  // Simplest approach: use noriginRef on the <button>; read back DOM node
  // via the wrapping container ref.
  const containerRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setOpen(false);
    // Return DOM focus to the trigger after the overlay unmounts.
    // Querying the button from the container avoids mutating noriginRef.
    setTimeout(() => {
      const btn = containerRef.current?.querySelector<HTMLButtonElement>(
        "button[aria-haspopup]",
      );
      btn?.focus();
      setFocus(focusKey);
    }, 0);
  };

  // Escape closes the menu and stops the event from propagating to the
  // SeriesDetailRoute's global Escape → navigate(-1) handler.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  // closeMenu is stable enough as a closure — adding it causes double-call
  // issues on re-renders; intentionally omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Click-outside closes the menu.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-focus first menu item when menu opens.
  useEffect(() => {
    if (open && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLButtonElement>("button");
      firstItem?.focus();
    }
  }, [open]);

  void domRef; // unused after refactor — kept for clarity

  return (
    <div ref={containerRef} style={{ position: "relative", flexShrink: 0 }}>
      {/* ⋯ trigger */}
      <button
        ref={noriginRef as RefObject<HTMLButtonElement>}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          background: focused || open ? "var(--bg-elevated)" : "transparent",
          border: focused || open
            ? "2px solid var(--accent-copper)"
            : "2px solid transparent",
          borderRadius: "var(--radius-sm)",
          color: focused || open ? "var(--accent-copper)" : "var(--text-secondary)",
          fontSize: 20,
          fontWeight: 700,
          cursor: "pointer",
          lineHeight: 1,
          transition:
            "background var(--motion-focus), border-color var(--motion-focus), color var(--motion-focus)",
        }}
      >
        ⋯
      </button>

      {/* Overlay menu */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={triggerLabel}
          style={{
            position: "absolute",
            zIndex: 200,
            ...(placement === "below"
              ? { top: "calc(100% + 4px)", right: 0 }
              : { top: 0, left: "calc(100% + 4px)" }),
            minWidth: 200,
            background: "var(--bg-elevated)",
            border: "1px solid var(--bg-surface)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            padding: "var(--space-1) 0",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                if (!action.disabled) {
                  action.onSelect();
                  closeMenu();
                }
              }}
              onKeyDown={(e) => {
                // Allow Up/Down to cycle items within the menu via DOM focus.
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const items = Array.from(
                    menuRef.current?.querySelectorAll<HTMLButtonElement>(
                      "button:not([disabled])",
                    ) ?? [],
                  );
                  const i = items.indexOf(e.currentTarget as HTMLButtonElement);
                  items[(i + 1) % items.length]?.focus();
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const items = Array.from(
                    menuRef.current?.querySelectorAll<HTMLButtonElement>(
                      "button:not([disabled])",
                    ) ?? [],
                  );
                  const i = items.indexOf(e.currentTarget as HTMLButtonElement);
                  items[(i - 1 + items.length) % items.length]?.focus();
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (!action.disabled) {
                    action.onSelect();
                    closeMenu();
                  }
                }
              }}
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-4)",
                background: "transparent",
                border: "none",
                color: action.disabled
                  ? "var(--text-secondary)"
                  : "var(--text-primary)",
                fontSize: "var(--text-body-size)",
                textAlign: "left",
                cursor: action.disabled ? "default" : "pointer",
                opacity: action.disabled ? 0.5 : 1,
                transition: "background var(--motion-focus)",
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--bg-surface)";
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
