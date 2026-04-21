import { apiClient } from "./client";
import { LoginResponseSchema } from "./schemas";

export async function login(username: string, password: string) {
  const raw = await apiClient.post<unknown>("/api/auth/login", {
    username,
    password,
  });
  return LoginResponseSchema.parse(raw);
}

export async function logout() {
  try {
    await apiClient.post("/api/auth/logout", {});
  } catch {
    // best-effort
  } finally {
    apiClient.clearTokens();
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
  // Per JWT contract: backend purges all refresh tokens; clear local storage too
  apiClient.clearTokens();
}

export function hasStoredToken(): boolean {
  return Boolean(sessionStorage.getItem("sv_access_token"));
}
