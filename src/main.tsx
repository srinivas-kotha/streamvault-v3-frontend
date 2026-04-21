import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./brand/tokens.css";
import "./index.css";
import "./primitives/index.css"; // aggregator — all primitive stylesheets
import App from "./App.tsx";
import { initSpatialNav } from "./nav/spatialNav";

// Must run before createRoot so norigin is ready when React mounts.
initSpatialNav();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
