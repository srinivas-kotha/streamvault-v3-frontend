/**
 * InstallHint — one-time nudge in Settings to install StreamVault as a PWA.
 *
 * Once installed (display:fullscreen kicks in structurally), the URL bar is
 * gone by manifest — no JS fullscreen dance needed. In-tab mode keeps the
 * graceful fullscreen-on-gesture fallback (see App.tsx).
 *
 * Visibility rules:
 *   • Hidden when running as an installed PWA (display-mode matches).
 *   • Hidden after the user dismisses (`sv_pwa_hint_dismissed` in localStorage).
 *   • Hidden when `sv_pwa_installed` has been written by the appinstalled handler.
 *
 * Install path:
 *   • If beforeinstallprompt was captured (Chromium-based TVs + Android TV
 *     Chrome) → "Install" button triggers the native prompt.
 *   • Otherwise → platform-specific manual instructions (Fire TV Silk, iOS
 *     Safari, etc.). Detected once from UA.
 */
import type { ReactElement, RefObject } from "react";
import { useState } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import {
  hasCapturedPrompt,
  isRunningAsPWA,
  triggerInstallPrompt,
} from "./installPrompt";

const DISMISS_KEY = "sv_pwa_hint_dismissed";
const INSTALLED_KEY = "sv_pwa_installed";

type Platform = "fireTv" | "androidTv" | "iosSafari" | "desktop" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent || "";
  if (/Silk|AFT/i.test(ua)) return "fireTv";
  if (/AndroidTV|GoogleTV|CrKey|BRAVIA|SmartTV|SMART-TV/i.test(ua))
    return "androidTv";
  if (/iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua))
    return "iosSafari";
  if (/Chrome|Edg/i.test(ua)) return "desktop";
  return "other";
}

const INSTRUCTIONS: Record<Platform, string> = {
  fireTv:
    "Open the Silk browser menu (☰) and choose 'Add to Home Screen'. Pin the icon to your home for full-screen launches.",
  androidTv:
    "Open the Chrome overflow menu (⋮) and choose 'Add to Home screen' or 'Install StreamVault'.",
  iosSafari:
    "Tap the Share icon, then 'Add to Home Screen'.",
  desktop:
    "Click the install icon (⊕ or ⤓) in the address bar, or use the browser's ⋮ menu → 'Install StreamVault'.",
  other:
    "Use your browser's menu and choose 'Add to Home screen' or 'Install'.",
};

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, value: "1" | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode / storage blocked */
  }
}

export function InstallHint(): ReactElement | null {
  // Compute on mount — changes during a session are rare.
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    if (isRunningAsPWA()) return false;
    if (readFlag(INSTALLED_KEY)) return false;
    if (readFlag(DISMISS_KEY)) return false;
    return true;
  });
  // Platform sniff is UA-based and stable across a session — compute once
  // on mount so render stays pure.
  const [platform] = useState<Platform>(() =>
    typeof window === "undefined" ? "other" : detectPlatform(),
  );

  const { ref: installRef, focused: installFocused } =
    useFocusable<HTMLButtonElement>({
      focusKey: "SETTINGS_PWA_INSTALL",
      onEnterPress: () => void handleInstall(),
    });
  const { ref: dismissRef, focused: dismissFocused } =
    useFocusable<HTMLButtonElement>({
      focusKey: "SETTINGS_PWA_DISMISS",
      onEnterPress: () => handleDismiss(),
    });

  async function handleInstall(): Promise<void> {
    const outcome = await triggerInstallPrompt();
    if (outcome === "accepted") {
      writeFlag(INSTALLED_KEY, "1");
      setVisible(false);
    }
  }
  function handleDismiss(): void {
    writeFlag(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const promptAvailable = hasCapturedPrompt();
  const instructions = INSTRUCTIONS[platform];

  return (
    <section
      aria-labelledby="install-heading"
      style={{
        margin: "0 0 var(--space-8) 0",
        padding: "var(--space-6)",
        border: "1px solid rgba(200, 121, 65, 0.35)",
        borderRadius: "var(--radius-md, 12px)",
        background:
          "linear-gradient(135deg, rgba(200,121,65,0.08) 0%, rgba(30,26,22,0.6) 100%)",
      }}
    >
      <h2
        id="install-heading"
        style={{
          margin: "0 0 var(--space-2) 0",
          fontSize: "var(--text-body-lg-size)",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        Install StreamVault for full-screen
      </h2>
      <p
        style={{
          margin: "0 0 var(--space-4) 0",
          color: "var(--text-secondary)",
          fontSize: "var(--text-body-size)",
          lineHeight: 1.4,
        }}
      >
        Installing removes the browser URL bar for good and launches the app
        in its own window. Your library, history, and preferences stay the
        same.
      </p>
      {!promptAvailable && (
        <p
          style={{
            margin: "0 0 var(--space-4) 0",
            color: "var(--text-tertiary)",
            fontSize: "var(--text-caption-size)",
            lineHeight: 1.4,
          }}
        >
          {instructions}
        </p>
      )}
      <div
        style={{
          display: "flex",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        {promptAvailable && (
          <button
            ref={installRef as RefObject<HTMLButtonElement>}
            type="button"
            onClick={() => void handleInstall()}
            className="focus-ring"
            style={{
              background: installFocused
                ? "var(--accent-copper)"
                : "var(--accent-copper-dim)",
              color: "var(--bg-base)",
              border: "none",
              borderRadius: "var(--radius-sm, 8px)",
              padding: "var(--space-3) var(--space-6)",
              fontSize: "var(--text-body-size)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Install
          </button>
        )}
        <button
          ref={dismissRef as RefObject<HTMLButtonElement>}
          type="button"
          onClick={handleDismiss}
          className="focus-ring"
          style={{
            background: dismissFocused
              ? "rgba(237, 228, 211, 0.14)"
              : "transparent",
            color: "var(--text-secondary)",
            border: "1px solid rgba(237, 228, 211, 0.24)",
            borderRadius: "var(--radius-sm, 8px)",
            padding: "var(--space-3) var(--space-6)",
            fontSize: "var(--text-body-size)",
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
