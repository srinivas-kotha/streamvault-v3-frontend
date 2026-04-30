import { useEffect, type ReactNode } from "react";
import { initInputMode } from "./inputMode";
import { InputModeErrorBoundary } from "./InputModeErrorBoundary";

interface Props {
  children: ReactNode;
}

/**
 * Mount once at app root. Initialises the input-mode state machine and
 * wraps children in an error boundary that falls back to TV-safe
 * defaults on any thrown error (master plan A15 / R12).
 *
 * Phase 1 ships this with all adaptive flags default-false — the
 * provider only writes data-input-mode; it does NOT change any visual
 * behaviour until a flag flip enables specific surfaces.
 */
export function InputModeProvider({ children }: Props): ReactNode {
  useEffect(() => {
    try {
      initInputMode();
    } catch {
      // Boundary will catch render-time throws; init runtime errors are
      // logged to console and ignored — the data-input-mode attribute may
      // be absent but the app still mounts.
      console.error("[input-mode] init failed; falling back to TV-safe defaults");
    }
  }, []);

  return (
    <InputModeErrorBoundary>{children}</InputModeErrorBoundary>
  );
}
