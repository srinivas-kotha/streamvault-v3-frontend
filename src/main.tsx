import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import "./brand/tokens.css";
import "./index.css";
import "./primitives/index.css"; // aggregator — all primitive stylesheets
import App from "./App.tsx";
import { initSpatialNav } from "./nav/spatialNav";
import { captureInstallPrompt } from "./features/install/installPrompt";

// Must run before createRoot so norigin is ready when React mounts.
initSpatialNav();

// `beforeinstallprompt` fires once per load and must be captured synchronously
// on the window, BEFORE React mounts — otherwise the event is lost and the
// Settings InstallHint can't programmatically trigger the native install UI.
captureInstallPrompt();

// TV platform sniff — covers Fire TV (Silk/AFT*), Android TV, Google TV,
// Chromecast (CrKey), Tizen, webOS, HbbTV, and common smart-TV UA markers.
// Setting data-tv on <html> lets tokens.css apply the fluid 10-foot scale
// before first paint. Desktop browsers stay on desktop scale.
(() => {
  const ua = navigator.userAgent || "";
  const isTv =
    /Silk|AFT|AndroidTV|GoogleTV|BRAVIA|Tizen|Web0S|WebOS|SMART-TV|SmartTV|HbbTV|CrKey|PhilipsTV|VIDAA/i.test(
      ua,
    );
  if (isTv) {
    document.documentElement.setAttribute("data-tv", "true");
  }
})();

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
