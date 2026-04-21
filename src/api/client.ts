const ACCESS_TOKEN_KEY = "sv_access_token";
const REFRESH_TOKEN_KEY = "sv_refresh_token";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  setTokens(accessToken: string, refreshToken: string): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  clearTokens(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${this.getAccessToken() ?? ""}`;
        const retryRes = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
        });
        if (!retryRes.ok)
          throw new ApiError(retryRes.status, `API error: ${retryRes.status}`);
        return retryRes.json() as Promise<T>;
      }
      throw new ApiError(401, "Unauthorized");
    }

    if (!res.ok) throw new ApiError(res.status, `API error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
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
