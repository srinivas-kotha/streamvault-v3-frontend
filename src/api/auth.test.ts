import { describe, it, expect, vi, beforeEach } from "vitest";
import { login, logout, changePassword, hasStoredToken } from "./auth";
import { apiClient } from "./client";

describe("auth API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("login parses valid LoginResponse", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({
      accessToken: "a.b.c",
      refreshToken: "r1",
      expiresIn: 900,
    });
    const resp = await login("admin", "pass");
    expect(resp.accessToken).toBe("a.b.c");
    expect(resp.refreshToken).toBe("r1");
  });

  it("login throws on invalid schema", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ foo: "bar" });
    await expect(login("u", "p")).rejects.toThrow();
  });

  it("logout clears tokens even when network call fails", async () => {
    sessionStorage.setItem("sv_access_token", "x");
    localStorage.setItem("sv_refresh_token", "y");
    vi.spyOn(apiClient, "post").mockRejectedValue(new Error("net"));
    await logout();
    expect(sessionStorage.getItem("sv_access_token")).toBeNull();
    expect(localStorage.getItem("sv_refresh_token")).toBeNull();
  });

  it("changePassword clears tokens after success (refresh purge contract)", async () => {
    sessionStorage.setItem("sv_access_token", "x");
    localStorage.setItem("sv_refresh_token", "y");
    vi.spyOn(apiClient, "post").mockResolvedValue({});
    await changePassword("old", "newpass123456");
    expect(sessionStorage.getItem("sv_access_token")).toBeNull();
    expect(localStorage.getItem("sv_refresh_token")).toBeNull();
  });

  it("hasStoredToken reflects sessionStorage state", () => {
    expect(hasStoredToken()).toBe(false);
    sessionStorage.setItem("sv_access_token", "x");
    expect(hasStoredToken()).toBe(true);
  });
});
