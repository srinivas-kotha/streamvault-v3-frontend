import { describe, it, expect } from "vitest";
import { LoginResponseSchema, ChannelSchema } from "./schemas";

describe("API Zod schemas", () => {
  it("parses valid login response (cookie-based backend shape)", () => {
    const raw = {
      message: "Login successful",
      userId: 1,
      username: "admin",
    };
    expect(() => LoginResponseSchema.parse(raw)).not.toThrow();
  });
  it("rejects login response missing username", () => {
    expect(() =>
      LoginResponseSchema.parse({ message: "ok", userId: 1 }),
    ).toThrow();
  });
  it("rejects login response with wrong userId type", () => {
    expect(() =>
      LoginResponseSchema.parse({ message: "ok", userId: "1", username: "a" }),
    ).toThrow();
  });
  it("parses valid channel", () => {
    const raw = {
      id: "1",
      name: "BBC News",
      categoryId: "5",
      streamUrl: "http://x.m3u8",
      num: 1,
    };
    expect(() => ChannelSchema.parse(raw)).not.toThrow();
  });
  it("rejects channel without streamUrl", () => {
    expect(() =>
      ChannelSchema.parse({ id: "1", name: "BBC", categoryId: "5", num: 1 }),
    ).toThrow();
  });
});
