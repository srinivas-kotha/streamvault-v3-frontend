// Auth is cookie-based on the backend (httpOnly access_token / refresh_token).
// The browser attaches those cookies automatically when fetch uses
// `credentials: "include"`, so the client does NOT read or write JWTs itself.
//
// `sv_access_token` (localStorage — moved from sessionStorage in Phase 1 of
// the UX rebuild, docs/ux/00-ia-navigation.md §7) is a lightweight sentinel,
// NOT a credential. App.tsx uses it to decide whether to show LoginPage vs
// AppShell on initial mount. A stale sentinel without a real cookie just
// causes the boot refresh or first API call to 401, at which point we clear
// it and re-show LoginPage.
//
// Migration: existing users with the key in sessionStorage are promoted to
// localStorage on first `hasSession()` call (see migrateLegacySession below).
// The promotion is one-shot — subsequent reads find the key in localStorage
// directly. Once every live client has warmed through this path, the
// migration branch is safe to delete.
//
// The sentinel's VALUE is the username when written post-login, or the
// literal string "authenticated" when written post-boot-refresh (the
// /auth/refresh response does not include a username). Consumers must treat
// it as opaque — only `hasSession()` checks presence.
const SESSION_KEY = "sv_access_token";
const CSRF_COOKIE = "sv_csrf";
const CSRF_HEADER = "x-csrf-token";

function migrateLegacySession(): void {
  try {
    const legacy = sessionStorage.getItem(SESSION_KEY);
    const current = localStorage.getItem(SESSION_KEY);
    if (legacy && !current) {
      localStorage.setItem(SESSION_KEY, legacy);
    }
    if (legacy) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // sessionStorage / localStorage may throw in restricted contexts.
    // The auth gate's boot refresh will fall through to unauthed on any
    // real inconsistency — migration is best-effort.
  }
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function readCsrfCookie(): string | null {
  // CSRF cookie is httpOnly:false by design (see streamvault-backend csrf
  // middleware) so JS can echo it back as a header on unsafe methods.
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setSession(username: string): void {
    try {
      localStorage.setItem(SESSION_KEY, username);
    } catch {
      // Quota / private-mode — swallow; the next API call will 401 and we
      // fall through to LoginPage.
    }
  }

  clearSession(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
      // Belt-and-braces: also wipe the legacy sessionStorage key so a stale
      // sentinel from a pre-migration tab can't resurrect an auth state.
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* see setSession */
    }
  }

  hasSession(): boolean {
    try {
      migrateLegacySession();
      return Boolean(localStorage.getItem(SESSION_KEY));
    } catch {
      return false;
    }
  }

  /**
   * Silent refresh called exactly once at app boot, BEFORE the auth gate
   * renders. Always hits /auth/refresh (even without a sentinel) so users
   * whose sentinel was wiped but still have a valid refresh_token cookie
   * recover gracefully. On success, ensures a sentinel exists so the gate
   * stays authed on subsequent mounts.
   *
   * Returns true iff /auth/refresh returned 2xx.
   */
  async tryBootRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) return false;
      if (!this.hasSession()) {
        this.setSession("authenticated");
      }
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const method = (options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const csrf = readCsrfCookie();
      if (csrf) headers[CSRF_HEADER] = csrf;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

    if (res.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        const retryHeaders: Record<string, string> = { ...headers };
        if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
          const csrf = readCsrfCookie();
          if (csrf) retryHeaders[CSRF_HEADER] = csrf;
        }
        const retryRes = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers: retryHeaders,
          credentials: "include",
        });
        if (!retryRes.ok)
          throw new ApiError(retryRes.status, `API error: ${retryRes.status}`);
        return retryRes.json() as Promise<T>;
      }
      this.clearSession();
      throw new ApiError(401, "Unauthorized");
    }

    if (!res.ok) throw new ApiError(res.status, `API error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async tryRefresh(): Promise<boolean> {
    // Refresh reads refresh_token from the httpOnly cookie — no body payload,
    // no client-side token state. Success rotates both cookies server-side.
    if (!this.hasSession()) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}

// In production (Vite `npm run build`), fetch same-origin — nginx.conf
// proxies `/api/*` to the backend container. Hard-coding `localhost:3001`
// as the build-time default shipped a bundle that tried to talk to the
// user's own laptop on prod, which CSP `connect-src 'self' https:` blocked
// — the error got laundered into "Invalid username or password" by the
// login catch, masking the real bug. `import.meta.env.DEV` is true ONLY
// for `npm run dev`, so Vite-built artefacts always take the empty-base
// branch.
const DEFAULT_BASE_URL = import.meta.env.DEV ? "http://localhost:3001" : "";

export const apiClient = new ApiClient(
  import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL,
);
