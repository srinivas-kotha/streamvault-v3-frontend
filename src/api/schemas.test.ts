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
  it("parses a backend CatalogItem-shaped channel (no num / no streamUrl)", () => {
    // Backend /api/live/channels returns CatalogItem shape — legacy fields
    // (num / streamUrl / logo / epgChannelId) are optional in the v3 schema.
    const raw = {
      id: "705131",
      name: "IPL Hindi Match 1",
      type: "live",
      categoryId: "807",
      icon: null,
      added: "1775054300",
      isAdult: false,
    };
    expect(() => ChannelSchema.parse(raw)).not.toThrow();
  });
  it("parses channel with rating as number (provider returns mixed types)", () => {
    const raw = {
      id: "1",
      name: "ESPN",
      categoryId: "5",
      rating: 3.8,
    };
    expect(() => ChannelSchema.parse(raw)).not.toThrow();
  });
});
