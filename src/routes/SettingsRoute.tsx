/**
 * SettingsRoute — /settings page (Phase 9).
 *
 * Sections:
 *   1. Account       — username display, change-password, logout
 *   2. Playback      — subtitle / audio / quality / autoplay prefs
 *   3. App Info      — version, build hash, legal links
 *   4. Danger Zone   — clear history, clear favorites
 */
import type { RefObject } from "react";
import { useState, useCallback } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import { logout } from "../api/auth";
import { ChangePasswordForm } from "../features/settings/ChangePasswordForm";
import { PreferencesPanel } from "../features/settings/PreferencesPanel";
import { AppInfoPanel } from "../features/settings/AppInfoPanel";
import "../features/settings/settings.css";

// ─── Read username from the session sentinel ─────────────────────────────────
// sv_access_token stores the username string set during login
// (see ApiClient.setSession). It is NOT a real token — just a display handle.
// Moved from sessionStorage → localStorage in Phase 1 of the UX rebuild
// (see docs/ux/00-ia-navigation.md §7). After tryBootRefresh promotes a
// cookie-only user, the sentinel may read the literal "authenticated" when
// no username is available in the /auth/refresh response.
function getSessionUsername(): string {
  const raw = localStorage.getItem("sv_access_token");
  if (!raw || raw === "authenticated") return "Unknown";
  return raw;
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [showChangePw, setShowChangePw] = useState(false);
  const [pwSuccessMsg, setPwSuccessMsg] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const username = getSessionUsername();

  const { ref: logoutRef, focused: logoutFocused } =
    useFocusable<HTMLButtonElement>({
      focusKey: "ACCOUNT_LOGOUT",
      onEnterPress: () => void handleLogout(),
    });

  const { ref: changePwRef, focused: changePwFocused } =
    useFocusable<HTMLButtonElement>({
      focusKey: "ACCOUNT_CHANGE_PW",
      onEnterPress: () => {
        setPwSuccessMsg(null);
        setShowChangePw(true);
      },
    });

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    await logout();
    // Navigate to root — App.tsx will detect missing session and show LoginPage.
    window.location.href = "/";
    onLoggedOut();
  }, [onLoggedOut]);

  const handlePwSuccess = useCallback(() => {
    // changePassword() already called apiClient.clearSession() per auth.ts contract.
    // Force reload to LoginPage.
    setPwSuccessMsg(
      "Password changed. You have been logged out — please sign in again.",
    );
    setShowChangePw(false);
    setTimeout(() => {
      window.location.href = "/";
    }, 2000);
  }, []);

  return (
    <section className="settings-section" aria-labelledby="account-heading">
      <h2 id="account-heading" className="settings-section-title">
        Account
      </h2>

      <div className="settings-account-row">
        <span className="settings-account-label">Signed in as</span>
        <span className="settings-account-value" data-testid="account-username">
          {username}
        </span>
      </div>

      {pwSuccessMsg && (
        <p className="settings-success" role="status">
          {pwSuccessMsg}
        </p>
      )}

      {!showChangePw ? (
        <div className="settings-account-row">
          <button
            ref={changePwRef as RefObject<HTMLButtonElement>}
            type="button"
            className={`settings-btn settings-btn--ghost${changePwFocused ? " settings-btn--focused" : ""}`}
            onClick={() => {
              setPwSuccessMsg(null);
              setShowChangePw(true);
            }}
            data-testid="btn-change-password"
          >
            Change Password
          </button>
        </div>
      ) : (
        <ChangePasswordForm
          onSuccess={handlePwSuccess}
          onCancel={() => setShowChangePw(false)}
        />
      )}

      <div className="settings-account-row">
        <button
          ref={logoutRef as RefObject<HTMLButtonElement>}
          type="button"
          className={`settings-btn settings-btn--ghost${logoutFocused ? " settings-btn--focused" : ""}`}
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          data-testid="btn-logout"
          aria-busy={loggingOut}
        >
          {loggingOut ? "Signing out…" : "Sign Out"}
        </button>
      </div>
    </section>
  );
}

// ─── Danger zone ─────────────────────────────────────────────────────────────

type DangerState = "idle" | "pending" | "done" | "error";

function DangerRow({
  focusKey,
  title,
  description,
  label,
  onConfirm,
  testId,
}: {
  focusKey: string;
  title: string;
  description: string;
  label: string;
  onConfirm: () => Promise<void>;
  testId?: string;
}) {
  const [state, setState] = useState<DangerState>("idle");

  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey,
    onEnterPress: () => void handleClick(),
  });

  async function handleClick() {
    setState("pending");
    try {
      await onConfirm();
      setState("done");
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  const btnLabel =
    state === "pending"
      ? "Clearing…"
      : state === "done"
        ? "Cleared"
        : state === "error"
          ? "Error — retry"
          : label;

  return (
    <div className="settings-danger-row">
      <div className="settings-danger-text">
        <span className="settings-danger-title">{title}</span>
        <span className="settings-danger-desc">{description}</span>
      </div>
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        className={`settings-btn settings-btn--danger${focused ? " settings-btn--focused" : ""}`}
        onClick={() => void handleClick()}
        disabled={state === "pending"}
        data-testid={testId}
        aria-busy={state === "pending"}
      >
        {btnLabel}
      </button>
    </div>
  );
}

async function clearHistory(): Promise<void> {
  // Clears localStorage-based watch history.
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("sv_hist"));
  keys.forEach((k) => localStorage.removeItem(k));
}

async function clearFavorites(): Promise<void> {
  // Clears localStorage-based favorites cache.
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith("sv_fav"),
  );
  keys.forEach((k) => localStorage.removeItem(k));
}

function DangerSection() {
  return (
    <section className="settings-section" aria-labelledby="danger-heading">
      <h2 id="danger-heading" className="settings-section-title">
        Danger Zone
      </h2>
      <DangerRow
        focusKey="DANGER_CLEAR_HISTORY"
        title="Clear Playback History"
        description="Removes your watch progress and recently watched list."
        label="Clear History"
        onConfirm={clearHistory}
        testId="btn-clear-history"
      />
      <DangerRow
        focusKey="DANGER_CLEAR_FAVORITES"
        title="Clear Favorites"
        description="Removes all items from your favourites list."
        label="Clear Favorites"
        onConfirm={clearFavorites}
        testId="btn-clear-favorites"
      />
    </section>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export function SettingsRoute() {
  const { ref, focusKey } = useFocusable({
    focusKey: "CONTENT_AREA_SETTINGS",
    focusable: false,
    trackChildren: true,
  });

  // onLoggedOut is a no-op here — the redirect in AccountSection handles navigation.
  const handleLoggedOut = useCallback(() => {}, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="settings"
        tabIndex={-1}
        style={{
          padding: "var(--space-8) var(--gutter-tv, var(--space-8))",
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
          maxWidth: "900px",
        }}
      >
        <h1
          style={{
            fontSize: "var(--text-title-size)",
            fontWeight: "var(--text-title-weight)",
            color: "var(--text-primary)",
            margin: "0 0 var(--space-8) 0",
          }}
        >
          Settings
        </h1>

        <AccountSection onLoggedOut={handleLoggedOut} />
        <PreferencesPanel />
        <AppInfoPanel />
        <DangerSection />
      </main>
    </FocusContext.Provider>
  );
}
