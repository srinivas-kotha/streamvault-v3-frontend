/**
 * PWA install prompt capture + helpers.
 *
 * `beforeinstallprompt` fires exactly once per page load on browsers that
 * support PWA install (Chromium-based). If we don't capture it, the event is
 * lost and we can never trigger the install UI programmatically. `captureInstallPrompt()`
 * runs from main.tsx before React mounts so we catch it regardless of which
 * route the user lands on.
 *
 * Consumers (Settings InstallHint) read via `getCapturedPrompt()` and call
 * `triggerInstallPrompt()` to fire the native install UI.
 *
 * Fire TV Silk / older TV browsers don't fire this event — consumers fall
 * back to platform-specific manual instructions in that case.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let captured: BeforeInstallPromptEvent | null = null;

export function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    captured = e as BeforeInstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    captured = null;
    try {
      localStorage.setItem("sv_pwa_installed", "1");
    } catch {
      /* storage may be blocked in private mode */
    }
  });
}

export function hasCapturedPrompt(): boolean {
  return captured !== null;
}

export async function triggerInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!captured) return "unavailable";
  try {
    await captured.prompt();
    const { outcome } = await captured.userChoice;
    captured = null;
    return outcome;
  } catch {
    return "unavailable";
  }
}

/** True when the app is running as an installed PWA (not an in-browser tab). */
export function isRunningAsPWA(): boolean {
  if (typeof window === "undefined") return false;
  const mm = typeof window.matchMedia === "function" ? window.matchMedia : null;
  if (
    mm &&
    (mm("(display-mode: fullscreen)").matches ||
      mm("(display-mode: standalone)").matches)
  ) {
    return true;
  }
  const navAny = navigator as Navigator & { standalone?: boolean };
  return navAny.standalone === true;
}
