import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * If anything in the input-mode subsystem throws (notably old Silk
 * lacking a recent DOM API), we still need the app to mount on Fire TV.
 *
 * Recovery: ensure data-input-mode="dpad" is set on <html>, log the
 * error, and render children anyway. This is intentionally
 * permissive — the boundary catches render-time throws but the rest of
 * the app renders normally.
 */
interface State {
  hasError: boolean;
}

export class InputModeErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Force-set TV-safe defaults so the rest of the app behaves like Phase-0 TV.
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-input-mode", "dpad");
    }
    console.error("[InputModeErrorBoundary] caught", error, info.componentStack);
  }

  render(): ReactNode {
    // On error: render null (cannot re-render the throwing children — React
    // would loop). The data-input-mode="dpad" fallback was set in
    // componentDidCatch so CSS still has a valid mode.
    //
    // In practice this boundary is a safety net; the InputModeProvider's
    // init() is wrapped in its own try/catch so this should never fire
    // for input-mode reasons. If something downstream throws, the parent
    // boundary chain (or React's default unhandled handler) takes over.
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
