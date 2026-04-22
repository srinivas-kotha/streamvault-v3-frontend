import { apiClient } from "./client";
import { LoginResponseSchema, type LoginResponse } from "./schemas";

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const raw = await apiClient.post<unknown>("/api/auth/login", {
    username,
    password,
  });
  const parsed = LoginResponseSchema.parse(raw);
  // Backend set httpOnly access_token/refresh_token cookies via Set-Cookie.
  // All we track client-side is a sentinel for the App-level auth gate.
  apiClient.setSession(parsed.username);
  return parsed;
}

export async function logout() {
  try {
    await apiClient.post("/api/auth/logout", {});
  } catch {
    // best-effort — backend clears cookies server-side too
  } finally {
    apiClient.clearSession();
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  await apiClient.post("/api/auth/change-password", {
    currentPassword,
    newPassword,
  });
  // Per contract: backend purges refresh tokens + clears cookies → we force
  // re-login by dropping the local sentinel too.
  apiClient.clearSession();
}

export function hasStoredToken(): boolean {
  return apiClient.hasSession();
}
