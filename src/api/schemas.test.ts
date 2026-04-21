import { describe, it, expect } from "vitest";
import { LoginResponseSchema, ChannelSchema } from "./schemas";

describe("API Zod schemas", () => {
  it("parses valid login response", () => {
    const raw = {
      accessToken: "abc.def.ghi",
      refreshToken: "xyz",
      expiresIn: 900,
    };
    expect(() => LoginResponseSchema.parse(raw)).not.toThrow();
  });
  it("rejects login response missing accessToken", () => {
    expect(() => LoginResponseSchema.parse({ refreshToken: "x" })).toThrow();
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
