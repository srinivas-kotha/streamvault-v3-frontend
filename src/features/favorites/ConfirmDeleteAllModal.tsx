/**
 * ConfirmDeleteAllModal — destructive confirm for "Delete all favorites".
 *
 * D-pad rules (per UX spec):
 *  - Default focus = Cancel (FAV_DELETE_ALL_CANCEL). Destructive action
 *    requires a deliberate Left to reach Delete all.
 *  - Escape / Backspace = Cancel.
 *  - Stop propagation on the dismiss key so it doesn't bubble to the
 *    BottomDock route handler.
 */
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import {
  useFocusable,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";

interface Props {
  count: number;
  onConfirm: () => void;
  onCancel: (trigger: "button" | "back") => void;
}

export function ConfirmDeleteAllModal({ count, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const { ref: cancelRef } = useFocusable<HTMLButtonElement>({
    focusKey: "FAV_DELETE_ALL_CANCEL",
    onEnterPress: () => onCancel("button"),
  });
  const { ref: confirmRef } = useFocusable<HTMLButtonElement>({
    focusKey: "FAV_DELETE_ALL_CONFIRM",
    onEnterPress: onConfirm,
  });

  useEffect(() => {
    setFocus("FAV_DELETE_ALL_CANCEL");
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.stopPropagation();
        e.preventDefault();
        onCancel("back");
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onCancel]);

  return (
    <div
      role="presentation"
      onClick={(e) => {
        // Only dismiss when the bare scrim is clicked, not its children.
        if (e.target === e.currentTarget) onCancel("button");
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fav-del-all-title"
        aria-describedby="fav-del-all-body"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--glass-popover-border, var(--border-subtle))",
          borderRadius: "var(--radius-md)",
          width: "min(480px, 90vw)",
          padding: "var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <h2
          id="fav-del-all-title"
          style={{
            margin: 0,
            fontSize: "var(--text-title-size)",
            color: "var(--text-primary)",
            fontWeight: 600,
          }}
        >
          Delete all favorites?
        </h2>
        <p
          id="fav-del-all-body"
          style={{
            margin: 0,
            fontSize: "var(--text-body-size)",
            color: "var(--text-secondary)",
          }}
        >
          This will remove all {count} item{count === 1 ? "" : "s"} from your
          favorites list. You&apos;ll have a few seconds to undo.
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            justifyContent: "flex-end",
            marginTop: "var(--space-2)",
          }}
        >
          <button
            ref={confirmRef as RefObject<HTMLButtonElement>}
            type="button"
            onClick={onConfirm}
            className="focus-ring"
            style={{
              padding: "var(--space-2) var(--space-5)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--danger, #d84343)",
              color: "var(--text-primary)",
              fontSize: "var(--text-label-size)",
              letterSpacing: "var(--text-label-tracking)",
              textTransform: "uppercase",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Delete all
          </button>
          <button
            ref={cancelRef as RefObject<HTMLButtonElement>}
            type="button"
            onClick={() => onCancel("button")}
            className="focus-ring"
            style={{
              padding: "var(--space-2) var(--space-5)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--accent-copper)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: "var(--text-label-size)",
              letterSpacing: "var(--text-label-tracking)",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
