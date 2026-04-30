/**
 * PlayerGestureLayer — transparent touch surface that sits BELOW the control
 * overlay (z=1 vs controls z=2). (Master plan §5 PR-FE-2, spec §2.)
 *
 * Two-path tap-toggle design:
 *   hidden → show  Controls have pointerEvents:none so touches fall through to
 *                  this layer (pointerEvents:auto). We detect the tap and call
 *                  onTapToggle, which wakes the controls via the toggleRef.
 *   visible → hide The controls themselves (z=2, pointerEvents:auto) intercept
 *                  the touch. PlayerControls' root div handles "tap on empty
 *                  area" via its own touchend handler and calls the same
 *                  toggleRef. The gesture layer never fires in this path.
 *
 * Tap definition (spec §2 — gesture grammar):
 *   - touchstart → touchend (no cancel)
 *   - displacement < 10 px
 *   - duration < 300 ms
 *
 * Hard guards (all return null / ignore):
 *   - TV mode (data-tv="true") — d-pad only, no gesture layer needed
 *   - Flag adaptive.player.tap_toggle is false
 *   - Tap target has a [data-player-control] ancestor
 *
 * Ghost-click prevention: e.preventDefault() on touchend stops the browser's
 * synthetic 300ms mousedown+click from firing after the touch.
 */
import { useRef, useCallback, useEffect } from "react";
import { getInputMode } from "../nav/inputMode";

const TAP_MAX_DURATION_MS = 300;
const TAP_MAX_DISPLACEMENT_PX = 10;

interface PlayerGestureLayerProps {
  onTapToggle: () => void;
}

export function PlayerGestureLayer({ onTapToggle }: PlayerGestureLayerProps) {
  const isTV = getInputMode() === "dpad";

  const touchStartRef = useRef<{
    x: number;
    y: number;
    t: number;
    identifier: number;
  } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      t: Date.now(),
      identifier: touch.identifier,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      const start = touchStartRef.current;
      if (!start) return;

      let end: Touch | null = null;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t && t.identifier === start.identifier) {
          end = t;
          break;
        }
      }
      touchStartRef.current = null;
      if (!end) return;

      const duration = Date.now() - start.t;
      const dx = end.clientX - start.x;
      const dy = end.clientY - start.y;
      const displacement = Math.sqrt(dx * dx + dy * dy);

      if (duration > TAP_MAX_DURATION_MS) return;
      if (displacement > TAP_MAX_DISPLACEMENT_PX) return;

      // Control buttons sit at z=2 (above this layer) with pointerEvents:auto
      // when visible — they intercept touches before this layer fires. This
      // check is a belt-and-suspenders guard in case any control element leaks
      // through (e.g., absolutely-positioned tooltips with lower z-index).
      const target = e.target as Element | null;
      if (target?.closest("[data-player-control]")) return;

      // Prevent ghost click (browser 300ms touch-to-click delay).
      e.preventDefault();

      onTapToggle();
    },
    [onTapToggle],
  );

  const handleTouchCancel = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    // touchstart can be passive (no preventDefault needed).
    // touchend must be non-passive so we can call preventDefault.
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    el.addEventListener("touchcancel", handleTouchCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [handleTouchStart, handleTouchEnd, handleTouchCancel]);

  if (isTV) return null;

  return (
    <div
      ref={overlayRef}
      data-testid="player-gesture-layer"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        // z=1: above the video (no z-index) but below the controls (z=2).
        // pointerEvents:auto so this div receives touch events that fall
        // through from the controls layer when controls are hidden
        // (controls have pointerEvents:none when not visible).
        // This layer only renders when tap_toggle flag is on (parent gates it),
        // which is a touch-device-only flag, so capturing mouse events here
        // does not degrade desktop UX.
        zIndex: 1,
        pointerEvents: "auto",
        touchAction: "none",
        background: "transparent",
      }}
    />
  );
}
