import { useEffect, useState } from "react";
import { getInputMode, onInputModeChange, type InputMode } from "./inputMode";

/**
 * Subscribe to input-mode changes. Components use this to render
 * surface-specific UI (gesture surfaces on touch, mouse hover bars on
 * desktop, big-control TV layouts on dpad).
 */
export function useInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>(getInputMode());
  useEffect(() => onInputModeChange(setMode), []);
  return mode;
}

export type { InputMode };
