import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./brand/tokens.css";
import "./index.css";
import "./primitives/index.css"; // aggregator — all primitive stylesheets
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
