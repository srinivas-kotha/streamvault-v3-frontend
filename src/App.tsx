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
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { BottomDock, type DockItem } from "./nav/BottomDock";
import { LiveRoute } from "./routes/LiveRoute";
import { MoviesRoute } from "./routes/MoviesRoute";
import { SeriesRoute } from "./routes/SeriesRoute";
import { SearchRoute } from "./routes/SearchRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { FavoritesRoute } from "./routes/FavoritesRoute";
import { HistoryRoute } from "./routes/HistoryRoute";
import { SeriesDetailRoute } from "./routes/SeriesDetailRoute";
import { TestPrimitivesRoute } from "./routes";
import { SilkProbe } from "./nav/SilkProbe";
import { LoginPage } from "./features/auth/LoginPage";
import { hasStoredToken } from "./api/auth";
import { PlayerProvider, PlayerShell } from "./player";

const DOCK_IDS: readonly DockItem[] = [
  "live",
  "movies",
  "series",
  "search",
  "settings",
] as const;

const DOCK_LABELS: Record<DockItem, string> = {
  live: "Live",
  movies: "Movies",
  series: "Series",
  search: "Search",
  settings: "Settings",
};

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

  // Prime norigin's focus tree on first render after auth. Without this,
  // norigin's lastFocused pointer is null (or still holds the unmounted
  // LOGIN_USERNAME), so the user's first ArrowLeft/Right press on the dock
  // is a no-op — the bug reported on the live site.
  //
  // The 100ms defer + short retry loop is load-bearing: DockTab children
  // register via `useFocusable` inside their own useEffect. React 19 +
  // StrictMode double-invoke + BrowserRouter mount order can race, so the
  // first setFocus can fire before the DOCK_* keys are registered. We
  // retry up to 10× every 50ms (max ~600ms) until the DOM activeElement
  // matches the expected dock tab label.
  useEffect(() => {
    if (hideDock) return;
    const target = `DOCK_${activeTab.toUpperCase()}`;
    const expectedLabel = DOCK_LABELS[activeTab];
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryPrime = () => {
      setFocus(target);
      const landed =
        document.activeElement?.getAttribute("aria-label") === expectedLabel;
      if (!landed && attempts < 10) {
        attempts += 1;
        timer = setTimeout(tryPrime, 50);
      }
    };
    timer = setTimeout(tryPrime, 100);
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back / Escape → jump to the active dock tab. Without this, the user has
  // to ArrowDown through the entire channel list / poster grid to reach the
  // dock and switch to Movies/Series/etc. Fire TV remote Back and browser
  // Escape both land here. The player overlay's own back handler takes
  // precedence when open (see PlayerProvider popstate listener) — this one
  // only fires when a route content area owns focus.
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      // Escape anywhere OR Backspace on elements that aren't text inputs.
      const t = e.target as HTMLElement | null;
      const isTextInput =
        t?.tagName === "INPUT" || t?.tagName === "TEXTAREA";
      if (e.key === "Escape" || (e.key === "Backspace" && !isTextInput)) {
        const active = document.activeElement?.getAttribute("aria-label");
        // Already on the dock? nothing to do.
        const dockLabels = Object.values(DOCK_LABELS);
        if (active && dockLabels.includes(active)) return;
        setFocus(`DOCK_${activeTab.toUpperCase()}`);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activeTab]);

  return (
    <div style={{ background: "var(--bg-shell-gradient, var(--bg-base))", minHeight: "100vh" }}>
      <Routes>
        <Route path="/" element={<Navigate to="/live" replace />} />
        <Route path="/live" element={<LiveRoute />} />
        <Route path="/movies" element={<MoviesRoute />} />
        <Route path="/series" element={<SeriesRoute />} />
        <Route path="/series/:id" element={<SeriesDetailRoute />} />
        <Route path="/search" element={<SearchRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/favorites" element={<FavoritesRoute />} />
        <Route path="/history" element={<HistoryRoute />} />
        <Route path="/test-primitives" element={<TestPrimitivesRoute />} />
        <Route path="/silk-probe" element={<SilkProbe />} />
      </Routes>
      <BottomDock
        activeItem={activeTab}
        onNavigate={(item) => navigate(`/${item}`)}
        hidden={hideDock}
      />
      {/* Single player overlay — mounts here so it's above all routes */}
      <PlayerShell />
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
    <PlayerProvider>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppShell />
      </BrowserRouter>
    </PlayerProvider>
  );
}
