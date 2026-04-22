import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client";

describe("ApiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    // Clear cookies jsdom-style
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
    });
  });

  it("sends requests with credentials: 'include' (cookie-based auth)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient("http://localhost:3001");
    await client.get("/api/test");
    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  it("does NOT add Authorization header (backend reads access_token cookie)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient("http://localhost:3001");
    await client.get("/api/test");
    const headers = fetchSpy.mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(headers?.Authorization).toBeUndefined();
  });

  it("forwards sv_csrf cookie as x-csrf-token on mutating requests", async () => {
    document.cookie = "sv_csrf=deadbeef; path=/";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient("http://localhost:3001");
    await client.post("/api/test", { a: 1 });
    const headers = fetchSpy.mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(headers?.["x-csrf-token"]).toBe("deadbeef");
  });

  it("returns parsed JSON on 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [1, 2, 3] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient("http://localhost:3001");
    const result = await client.get("/api/test");
    expect(result).toEqual({ data: [1, 2, 3] });
  });

  it("throws ApiError on 401 (no session → no refresh attempt)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
      }),
    );
    const client = new ApiClient("http://localhost:3001");
    await expect(client.get("/api/test")).rejects.toMatchObject({
      status: 401,
    });
  });
});
