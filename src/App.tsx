/**
 * App — root component (Task 1.7)
 *
 * Path-switches on window.location.pathname:
 *   /test-primitives  → TestPrimitivesRoute (dev-time axe/visual fixture)
 *   *                 → placeholder (Phase 2 adds real router + Dock)
 *
 * The /test-primitives route is permanent — it is the Playwright axe target and
 * future visual-regression baseline. It is not reachable at "/" in production.
 */
import { TestPrimitivesRoute } from "./routes";

export default function App() {
  if (window.location.pathname === "/test-primitives") {
    return <TestPrimitivesRoute />;
  }
  return null;
}
