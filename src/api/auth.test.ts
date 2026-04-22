import { describe, it, expect, vi, beforeEach } from "vitest";
import { login, logout, changePassword, hasStoredToken } from "./auth";
import { apiClient } from "./client";

describe("auth API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("login parses cookie-based LoginResponse and sets session sentinel", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({
      message: "Login successful",
      userId: 42,
      username: "admin",
    });
    const resp = await login("admin", "pass");
    expect(resp.username).toBe("admin");
    expect(resp.userId).toBe(42);
    expect(resp.message).toBe("Login successful");
    // Sentinel written so App.tsx can render AppShell on next mount.
    expect(apiClient.hasSession()).toBe(true);
  });

  it("login throws on invalid schema (e.g. legacy JWT shape)", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({
      accessToken: "a.b.c",
      refreshToken: "r1",
    });
    await expect(login("u", "p")).rejects.toThrow();
    expect(apiClient.hasSession()).toBe(false);
  });

  it("logout clears session sentinel even when network call fails", async () => {
    apiClient.setSession("admin");
    vi.spyOn(apiClient, "post").mockRejectedValue(new Error("net"));
    await logout();
    expect(apiClient.hasSession()).toBe(false);
  });

  it("changePassword clears session after success (refresh purge contract)", async () => {
    apiClient.setSession("admin");
    vi.spyOn(apiClient, "post").mockResolvedValue({});
    await changePassword("old", "newpass123456");
    expect(apiClient.hasSession()).toBe(false);
  });

  it("hasStoredToken reflects session sentinel state", () => {
    expect(hasStoredToken()).toBe(false);
    apiClient.setSession("admin");
    expect(hasStoredToken()).toBe(true);
  });
});
