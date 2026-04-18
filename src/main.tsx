import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./brand/tokens.css";
import "./primitives/focus-ring.css";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
