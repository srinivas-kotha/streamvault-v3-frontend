import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client";

describe("ApiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("adds Authorization header when token present", async () => {
    sessionStorage.setItem("sv_access_token", "test-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient("http://localhost:3001");
    await client.get("/api/test");
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
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

  it("throws ApiError on 401", async () => {
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
