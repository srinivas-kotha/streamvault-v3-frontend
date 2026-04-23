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
import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  setFocus,
  getCurrentFocusKey,
  doesFocusableExist,
} from "@noriginmedia/norigin-spatial-navigation";
import { BottomDock, type DockItem } from "./nav/BottomDock";
import { resetOriginators } from "./nav/backStack";
import { logEvent } from "./telemetry";
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
import { apiClient } from "./api/client";
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
  const activeTab: DockItem = isDockItem(first) ? first : "movies";

  // Back-to-dock-then-exit: when the user presses Back while already on a
  // dock tab, we let the event through AND mark a timestamp here so the
  // popstate sentinel stops re-pushing. Without this, Fire TV's hardware
  // Back was absorbed even from the dock — there was no path out.
  const lastDockBackAtRef = useRef<number>(0);

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
  //
  // Fire TV Silk browser variants: the remote Back button arrives as
  // `Backspace`, `Back`, `GoBack`, or keyCode 4 depending on firmware. Catch
  // all of them.
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const isTextInput =
        t?.tagName === "INPUT" || t?.tagName === "TEXTAREA";
      const isBackKey =
        e.key === "Escape" ||
        e.key === "Back" ||
        e.key === "GoBack" ||
        (e.key === "Backspace" && !isTextInput) ||
        e.keyCode === 4;
      if (!isBackKey) return;

      const active = document.activeElement?.getAttribute("aria-label");
      const dockLabels = Object.values(DOCK_LABELS);
      const segments = window.location.pathname.split("/").filter(Boolean);
      const route = "/" + segments.join("/") || "/";
      const depth = segments.length;

      if (active && dockLabels.includes(active)) {
        // Back on the dock → exit. Record the timestamp so the popstate
        // sentinel stops re-pushing and the hardware Back reaches the OS.
        lastDockBackAtRef.current = Date.now();
        logEvent("back_pressed", {
          route,
          depth,
          handled_by: "dock_exit",
        });
        return;
      }

      // 4-level hierarchy (UX lead confirmed 2026-04-24):
      //   Detail route (/series/:id, /movies/:id, …) → browser history.back()
      //     so React Router navigates to the parent list route.
      //   Root route (/series, /movies, /live, /search, /settings) → jump
      //     focus to the active dock tab, preventDefault so we stay on the
      //     page. The *next* Back (now on the dock) exits per the branch
      //     above.
      const isDetailRoute = segments.length > 1;
      if (isDetailRoute) {
        // Let the browser's default (or the popstate listener below)
        // handle the history pop. Don't preventDefault.
        logEvent("back_pressed", {
          route,
          depth,
          handled_by: "detail_route_pop",
        });
        return;
      }
      logEvent("back_pressed", {
        route,
        depth,
        handled_by: "root_to_dock",
      });
      setFocus(`DOCK_${activeTab.toUpperCase()}`);
      e.preventDefault();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activeTab]);

  // Exit-guard: keep ONE sentinel history entry so Fire TV's hardware Back
  // (which can fire popstate directly without a keydown) doesn't pop us out
  // of the PWA on its own. The PlayerProvider's own popstate listener takes
  // precedence while the player is open; this one runs for the rest of the
  // app.
  //
  // Bug shipped before 2026-04-23 evening fix: this effect depended on
  // `[activeTab]`, and every dock-tab switch re-pushed a fresh sentinel.
  // History accumulated `[… /series, /series#sv, /live, /live#sv, /movies,
  // /movies#sv]`, and Back from the dock walked through every entry one at
  // a time — user saw the URL "re-populate" through old tabs instead of
  // exiting. Fixed by pushing the sentinel exactly once (tracked via ref)
  // and by letting popstate re-push only when absolutely needed.
  //
  // Active-tab reference is captured in a ref so the popstate handler always
  // reads the latest tab without re-subscribing.
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const sentinelPushedRef = useRef(false);
  useEffect(() => {
    if (!sentinelPushedRef.current && !window.history.state?.svExitGuard) {
      window.history.pushState({ svExitGuard: true }, "");
      sentinelPushedRef.current = true;
    }

    const onPop = () => {
      // If Back was just pressed from the dock via keyboard, the user is
      // asking to leave. Don't re-push the sentinel — let the pop resolve
      // so the browser / Fire TV host can close the tab / PWA. 600ms
      // window matches the Prime Video exit timing.
      if (Date.now() - lastDockBackAtRef.current < 600) {
        sentinelPushedRef.current = false;
        return;
      }
      const segments = window.location.pathname.split("/").filter(Boolean);
      const isDetailRoute = segments.length > 1;
      if (isDetailRoute) {
        // React-router will handle the navigation; don't interfere.
        return;
      }

      // Root dock route AND popstate fired without a preceding keydown —
      // this is how Fire TV / Android TV remote Back arrives. Mirror the
      // keyboard flow:
      //   • If the dock already has focus → the user wants OUT. Don't
      //     re-push the sentinel; the next browser-level Back will close
      //     the tab or return to the previous page.
      //   • Otherwise focus is in the grid / hero — first Back should
      //     anchor the user to the dock. Re-push the sentinel and set
      //     focus so the next Back can exit.
      const activeLabel =
        document.activeElement?.getAttribute("aria-label") ?? "";
      const dockLabels = Object.values(DOCK_LABELS);
      const isDockFocused = dockLabels.includes(activeLabel);

      if (isDockFocused) {
        sentinelPushedRef.current = false;
        return;
      }
      window.history.pushState({ svExitGuard: true }, "");
      sentinelPushedRef.current = true;
      setFocus(`DOCK_${activeTabRef.current.toUpperCase()}`);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Global D-pad focus-recovery watcher. Any dead-direction arrow press
  // (Left on the first poster, Right on the rightmost dock tab, Up on the
  // hero, arrows on an empty state, etc.) can leave norigin's currentFocusKey
  // pointing at an unmounted key while document.activeElement drifts to
  // <body>. Subsequent arrows are then no-ops until the user clicks or
  // reloads — see streamvault-v3-focus-vanish-bug.md.
  //
  // Strategy: remember the last focusKey that was genuinely focused, and on
  // every arrow keyup check whether focus survived. If it didn't, restore
  // the last known good key; if that key is also gone, fall back to the
  // active dock tab (same anchor the mount-prime effect uses).
  //
  // Runtime cost: two cheap listeners, one ref write per focus change, no
  // work in the common (focus-is-fine) case.
  useEffect(() => {
    if (hideDock) return;
    const fallbackKey = `DOCK_${activeTab.toUpperCase()}`;
    let lastGoodKey: string | null = null;

    const onFocusIn = () => {
      const key = getCurrentFocusKey();
      if (key && doesFocusableExist(key)) {
        lastGoodKey = key;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight"
      ) {
        return;
      }
      const current = getCurrentFocusKey();
      const stuck =
        !current ||
        !doesFocusableExist(current) ||
        document.activeElement === document.body ||
        document.activeElement == null;
      if (!stuck) return;
      const target =
        lastGoodKey && doesFocusableExist(lastGoodKey)
          ? lastGoodKey
          : fallbackKey;
      setFocus(target);
    };

    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [activeTab, hideDock]);

  return (
    <div style={{ background: "var(--bg-shell-gradient, var(--bg-base))", minHeight: "100vh" }}>
      <Routes>
        <Route path="/" element={<Navigate to="/movies" replace />} />
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
        onNavigate={(item) => {
          // Dock taps are lateral surface swaps, not back-stack pushes:
          // navigate with `replace: true` so a Back from the new
          // surface doesn't return to the previous detail route. Also
          // wipe any stored originators — tapping the dock is a
          // deliberate fresh-start signal.
          resetOriginators();
          logEvent("dock_navigated", { to: item });
          navigate(`/${item}`, { replace: true });
        }}
        hidden={hideDock}
      />
      {/* Single player overlay — mounts here so it's above all routes */}
      <PlayerShell />
    </div>
  );
}

/**
 * Auth gate — async boot with silent refresh.
 *
 * On mount we ALWAYS hit /auth/refresh once (regardless of sentinel presence).
 * This is the "60-day sliding session" behavior spec'd in
 * docs/ux/00-ia-navigation.md §7.3:
 *   - Users who closed the tab with a valid refresh cookie stay logged in.
 *   - Users whose local sentinel was wiped but still have a valid cookie
 *     recover gracefully (no forced re-login).
 *   - Users with no cookie (or an expired one) see LoginPage.
 *
 * While `checking`, render nothing — boot refresh is fast (<100ms typical),
 * and a splash would FOUC/flicker on a warm session.
 */
type AuthGate = "checking" | "authed" | "unauthed";

export default function App() {
  const [gate, setGate] = useState<AuthGate>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await apiClient.tryBootRefresh();
      if (cancelled) return;
      if (ok) {
        setGate("authed");
      } else {
        apiClient.clearSession();
        setGate("unauthed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // TV browsers (Android TV / Google TV Chrome) keep the URL bar visible
  // unless the app is installed as a PWA or enters Fullscreen via user
  // gesture. The manifest declares display:fullscreen, but that only takes
  // effect for installed PWAs.
  //
  // Bug reported 2026-04-23 evening: earlier version requested fullscreen
  // only on the FIRST gesture (`{ once: true }`). If the browser dropped
  // fullscreen for any reason (route change, popstate, media control,
  // some TV browsers re-show the URL bar on navigation), we never
  // re-entered, and the URL bar stayed visible until reload.
  //
  // Fix: keep listeners alive for the whole authed session. On every
  // gesture, if we're NOT in fullscreen, try to enter. Browsers require
  // a user gesture to enter fullscreen, and a keypress / tap qualifies,
  // so this silently re-arms the full-bleed view whenever the user is
  // interacting with the app.
  useEffect(() => {
    if (gate !== "authed") return;
    const tryEnter = () => {
      if (document.fullscreenElement) return;
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      const req =
        el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
      if (!req) return;
      Promise.resolve(req()).catch(() => {
        /* silent — TV browser may refuse without PWA install */
      });
    };
    window.addEventListener("keydown", tryEnter, { passive: true });
    window.addEventListener("pointerdown", tryEnter, { passive: true });
    return () => {
      window.removeEventListener("keydown", tryEnter);
      window.removeEventListener("pointerdown", tryEnter);
    };
  }, [gate]);

  if (gate === "checking") {
    return null;
  }

  if (gate === "unauthed") {
    return <LoginPage onLoginSuccess={() => setGate("authed")} />;
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
