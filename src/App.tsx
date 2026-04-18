import { TypographyGate } from "./brand/TypographyGate";

// Phase A — Task 1.2: route /typography-gate to TypographyGate.
// Revert to empty shell once gate is confirmed (Phase B).
function App() {
  if (window.location.pathname === "/typography-gate") {
    return <TypographyGate />;
  }

  // Empty shell — Phase 1 primitives land in later tasks
  return null;
}

export default App;
