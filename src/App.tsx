/**
 * App — root component (Task 1.7 + 2.1)
 *
 * Path-switches on window.location.pathname:
 *   /test-primitives  → TestPrimitivesRoute (dev-time axe/visual fixture)
 *   /silk-probe       → SilkProbe (Task 2.1 — norigin WebKit/Silk compatibility probe)
 *   *                 → placeholder (Phase 2 adds real router + Dock)
 *
 * NOTE: React Router is deliberately NOT used here — it's introduced in Task 2.3.
 * Until then, simple pathname checks keep the routing dependency surface minimal.
 *
 * Both /test-primitives and /silk-probe are permanent dev-time routes — they serve
 * as Playwright probe targets and future visual-regression baselines.
 */
import { TestPrimitivesRoute } from "./routes";
import { SilkProbe } from "./nav/SilkProbe";

export default function App() {
  if (window.location.pathname === "/test-primitives") {
    return <TestPrimitivesRoute />;
  }
  if (window.location.pathname === "/silk-probe") {
    return <SilkProbe />;
  }
  return null;
}
