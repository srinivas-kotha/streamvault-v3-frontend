import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import "./brand/tokens.css";
import "./index.css";
import "./primitives/index.css"; // aggregator — all primitive stylesheets
import App from "./App.tsx";
import { initSpatialNav } from "./nav/spatialNav";

// Must run before createRoot so norigin is ready when React mounts.
initSpatialNav();

// Task 2.4: expose setFocus on window in dev/test builds so Playwright can
// prime norigin's focus tree (DOM focus alone doesn't update norigin's internal
// lastFocused pointer). Guarded by import.meta.env.DEV so prod bundles
// don't carry the handle.
if (import.meta.env.DEV) {
  (window as unknown as { __svSetFocus: typeof setFocus }).__svSetFocus =
    setFocus;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
