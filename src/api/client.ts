// Auth is cookie-based on the backend (httpOnly access_token / refresh_token).
// The browser attaches those cookies automatically when fetch uses
// `credentials: "include"`, so the client does NOT read or write JWTs itself.
//
// `sv_session` (sessionStorage) is a lightweight sentinel — not a credential —
// used only by App.tsx to decide whether to show LoginPage vs AppShell on
// initial mount. A stale sentinel without a real cookie just causes the first
// API call to 401, at which point we clear it and re-show LoginPage.
//
// `sv_access_token` is retained as an alias for backward-compat with the
// E2E suite (tests/e2e/helpers.ts seeds it, tests/e2e/auth.spec.ts asserts on
// it post-login). Its value is the username, not a JWT.
const SESSION_KEY = "sv_access_token";
const CSRF_COOKIE = "sv_csrf";
const CSRF_HEADER = "x-csrf-token";

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
    sessionStorage.setItem(SESSION_KEY, username);
  }

  clearSession(): void {
    sessionStorage.removeItem(SESSION_KEY);
  }

  hasSession(): boolean {
    return Boolean(sessionStorage.getItem(SESSION_KEY));
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

export const apiClient = new ApiClient(
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001",
);
