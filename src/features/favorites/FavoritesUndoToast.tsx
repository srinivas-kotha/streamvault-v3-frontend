/**
 * FavoritesUndoToast — bottom-center toast with countdown progress + Undo.
 *
 * Auto-dismisses after `durationMs`. Pressing Back/Escape during the
 * window dismisses the toast WITHOUT triggering undo (per UX spec — Back
 * during the undo window means "I'm leaving, don't undo").
 */
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

interface Props {
  onUndo: () => void;
  onExpire: () => void;
  durationMs?: number;
}

export function FavoritesUndoToast({
  onUndo,
  onExpire,
  durationMs = 6000,
}: Props) {
  const [progress, setProgress] = useState(1);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const { ref: undoRef } = useFocusable<HTMLButtonElement>({
    focusKey: "FAV_UNDO_TOAST",
    onEnterPress: onUndo,
  });

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const ratio = Math.max(0, 1 - elapsed / durationMs);
      setProgress(ratio);
      if (ratio <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [durationMs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.stopPropagation();
        e.preventDefault();
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpireRef.current();
        }
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom:
          "calc(var(--dock-height, 80px) + var(--dock-bottom-offset, 0px) + var(--space-4))",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-5)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        zIndex: 1100,
        minWidth: 280,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <span style={{ color: "var(--text-primary)", fontSize: "var(--text-body-size)" }}>
        Favorites cleared
      </span>
      <button
        ref={undoRef as RefObject<HTMLButtonElement>}
        type="button"
        onClick={onUndo}
        className="focus-ring"
        style={{
          padding: "var(--space-1) var(--space-3)",
          borderRadius: "var(--radius-sm)",
          border: "none",
          background: "transparent",
          color: "var(--accent-copper)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-tracking)",
          textTransform: "uppercase",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Undo
      </button>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 3,
          width: `${progress * 100}%`,
          background: "var(--accent-copper)",
          transition: "width 0.1s linear",
          borderRadius: "0 0 var(--radius-sm) var(--radius-sm)",
        }}
      />
    </div>
  );
}
