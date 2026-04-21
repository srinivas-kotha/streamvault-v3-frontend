/**
 * App — root component (Task 2.3 — React Router 6 wired).
 *
 * BrowserRouter wraps AppShell; AppShell derives BottomDock's activeTab from
 * useLocation (deep-links + back/forward stay in sync) and wires onNavigate to
 * useNavigate so dock clicks / D-pad Enter change the URL.
 *
 * Preserved dev-time routes: /test-primitives and /silk-probe (permanent
 * Playwright probe targets — Task 1.7 + Task 2.1).
 */
import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { BottomDock, type DockItem } from "./nav/BottomDock";
import { LiveRoute } from "./routes/LiveRoute";
import { MoviesRoute } from "./routes/MoviesRoute";
import { SeriesRoute } from "./routes/SeriesRoute";
import { SearchRoute } from "./routes/SearchRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { TestPrimitivesRoute } from "./routes";
import { SilkProbe } from "./nav/SilkProbe";
import { LoginPage } from "./features/auth/LoginPage";
import { hasStoredToken } from "./api/auth";

const DOCK_IDS: readonly DockItem[] = [
  "live",
  "movies",
  "series",
  "search",
  "settings",
] as const;

function isDockItem(value: string | undefined): value is DockItem {
  return value !== undefined && (DOCK_IDS as readonly string[]).includes(value);
}

function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const first = pathname.split("/")[1];
  const activeTab: DockItem = isDockItem(first) ? first : "live";

  // Hide the dock on dev-time probe routes so it doesn't overlap the fixture.
  const hideDock =
    pathname.startsWith("/test-primitives") ||
    pathname.startsWith("/silk-probe");

  return (
    <div style={{ background: "var(--bg-base)", minHeight: "100vh" }}>
      <Routes>
        <Route path="/" element={<Navigate to="/live" replace />} />
        <Route path="/live" element={<LiveRoute />} />
        <Route path="/movies" element={<MoviesRoute />} />
        <Route path="/series" element={<SeriesRoute />} />
        <Route path="/search" element={<SearchRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/test-primitives" element={<TestPrimitivesRoute />} />
        <Route path="/silk-probe" element={<SilkProbe />} />
      </Routes>
      <BottomDock
        activeItem={activeTab}
        onNavigate={(item) => navigate(`/${item}`)}
        hidden={hideDock}
      />
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(hasStoredToken());

  if (!authed) {
    return <LoginPage onLoginSuccess={() => setAuthed(true)} />;
  }

  // Opt-in to v7 behavior early to silence Future Flag warnings and smooth the
  // React Router 6 → 7 upgrade when we take it.
  return (
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppShell />
    </BrowserRouter>
  );
}
