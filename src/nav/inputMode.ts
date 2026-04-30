/**
 * inputMode — JS state machine that authoritatively decides whether the
 * user is driving via d-pad / keyboard / mouse / touch. Writes the result
 * to `data-input-mode` on `<html>` so CSS can branch.
 *
 * Why a state machine instead of CSS pointer media queries:
 *   - `(pointer: coarse)` is unreliable on hybrid devices (Surface, iPad
 *     with trackpad, Chromebooks).
 *   - We need terminal `dpad` mode on Fire TV (data-tv="true" on root).
 *   - Touch + mouse combo devices need to "switch" mid-session based on
 *     last input observed.
 *
 * Modes:
 *   dpad     - Fire TV / Android TV / Tizen / WebOS — d-pad only.
 *              TERMINAL: once set on TV via main.tsx UA sniff, stays.
 *   keyboard - desktop tab/arrow nav (no mouse activity recently)
 *   mouse    - desktop with active mouse pointer
 *   touch    - touch event fired most recently
 *
 * Per master plan A2 + A11 + A15: never disables norigin; just publishes
 * a CSS-driving attribute. ErrorBoundary in InputModeProvider catches any
 * runtime error so the app still mounts on Fire TV (R12 / grill #3).
 */

export type InputMode = "dpad" | "keyboard" | "mouse" | "touch";

const ATTR = "data-input-mode";
const TV_ATTR = "data-tv";
const SWITCH_THROTTLE_MS = 100;

let current: InputMode = "keyboard";
let lastSwitchAt = 0;
const listeners = new Set<(mode: InputMode) => void>();

function isTV(): boolean {
  // Reads the attribute set in main.tsx by the UA sniff. Memoised at
  // module load — fragile if the attribute is removed at runtime, but in
  // practice the TV detection only runs once per session.
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(TV_ATTR) === "true";
}

function setMode(next: InputMode): void {
  // Terminal: TV stays in dpad mode regardless of stray events.
  if (isTV() && next !== "dpad") return;
  if (next === current) return;

  // Throttle thrash on hybrid devices: a touch immediately followed by a
  // synthetic mouseover would otherwise toggle modes back and forth.
  const now = Date.now();
  if (now - lastSwitchAt < SWITCH_THROTTLE_MS) return;
  lastSwitchAt = now;

  current = next;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(ATTR, next);
  }
  for (const fn of listeners) {
    try {
      fn(next);
    } catch {
      /* listener errors are isolated */
    }
  }
}

/** Read the current input mode. SSR-safe (returns "keyboard"). */
export function getInputMode(): InputMode {
  return current;
}

/** Subscribe to mode changes. Returns an unsubscribe fn. */
export function onInputModeChange(fn: (mode: InputMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Initialise the state machine. Idempotent.
 *
 * Wires:
 *   - keydown ArrowKeys/Tab → keyboard (or dpad on TV)
 *   - pointerdown/mousemove → mouse (touch overrides mouse on hybrid)
 *   - touchstart → touch
 *
 * Old Silk fallback (A15): some Silk versions lack
 * `MediaQueryList.addEventListener` and certain pointer events. Each
 * listener install is wrapped in try/catch; the InputModeProvider error
 * boundary catches any module-level throw.
 */
export function initInputMode(): void {
  if (typeof window === "undefined") return;
  const fn = initInputMode as unknown as { __initialised: boolean };
  if (fn.__initialised) return;
  fn.__initialised = true;

  // Establish initial mode.
  if (isTV()) {
    setMode("dpad");
  } else {
    // Default: prefer mouse if hover-capable, else keyboard.
    let initial: InputMode = "keyboard";
    try {
      const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
      if (mq.matches) initial = "mouse";
    } catch {
      /* matchMedia missing on very old Silk — stay keyboard */
    }
    current = initial;
    document.documentElement.setAttribute(ATTR, initial);
  }

  // Listeners. Each install is independently try/caught so a single
  // missing API on old Silk doesn't kill input mode entirely.
  const safeAdd = (
    target: EventTarget,
    ev: string,
    handler: EventListener,
    opts?: AddEventListenerOptions,
  ): void => {
    try {
      target.addEventListener(ev, handler, opts);
    } catch {
      /* swallow — partial functionality is better than crash */
    }
  };

  safeAdd(window, "keydown", (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === "Tab" || ke.key.startsWith("Arrow") || ke.key === "Enter") {
      // On TV, terminal dpad. On desktop, this is keyboard nav.
      setMode(isTV() ? "dpad" : "keyboard");
    }
  }, { passive: true });

  safeAdd(window, "pointerdown", (e) => {
    const pe = e as PointerEvent;
    const t = pe.pointerType;
    if (t === "touch" || t === "pen") setMode("touch");
    else if (t === "mouse") setMode("mouse");
  }, { passive: true });

  safeAdd(window, "mousemove", () => setMode("mouse"), { passive: true });
  safeAdd(window, "touchstart", () => setMode("touch"), { passive: true });
}

// Hot-reload + test escape: store the "did init?" flag as a property on
// the function. Avoids module-level mutable state for cleaner tree-shake.
(initInputMode as unknown as { __initialised: boolean }).__initialised = false;

/** Reset for tests only. */
export function __resetForTests(): void {
  current = "keyboard";
  lastSwitchAt = 0;
  listeners.clear();
  (initInputMode as unknown as { __initialised: boolean }).__initialised = false;
  if (typeof document !== "undefined") {
    document.documentElement.removeAttribute(ATTR);
  }
}
