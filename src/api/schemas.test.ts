import { describe, it, expect } from "vitest";
import {
  LoginResponseSchema,
  ChannelSchema,
  VodItemSchema,
  SeriesPreviewSchema,
  HistoryItemSchema,
  FavoriteItemSchema,
  EpgEntrySchema,
  CatalogItemSchema,
  ContentUidSchema,
} from "./schemas";

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

// ─── Phase 3 FE: ContentUidSchema + optional content_uid on all data schemas ─

describe("ContentUidSchema", () => {
  it("accepts a valid 16-char lowercase hex string", () => {
    expect(() => ContentUidSchema.parse("a1b2c3d4e5f60718")).not.toThrow();
  });
  it("accepts all lowercase hex digits", () => {
    expect(() => ContentUidSchema.parse("abcdef0123456789")).not.toThrow();
  });
  it("rejects uppercase hex", () => {
    expect(() => ContentUidSchema.parse("A1B2C3D4E5F60718")).toThrow();
  });
  it("rejects a string shorter than 16 chars", () => {
    expect(() => ContentUidSchema.parse("a1b2c3d4e5f607")).toThrow();
  });
  it("rejects a string longer than 16 chars", () => {
    expect(() => ContentUidSchema.parse("a1b2c3d4e5f607180")).toThrow();
  });
  it("rejects non-hex characters", () => {
    expect(() => ContentUidSchema.parse("a1b2c3d4e5g60718")).toThrow();
  });
});

describe("content_uid optional field on data schemas", () => {
  it("ChannelSchema accepts content_uid when present", () => {
    const raw = {
      id: "1",
      name: "BBC News",
      categoryId: "5",
      content_uid: "a1b2c3d4e5f60718",
    };
    expect(() => ChannelSchema.parse(raw)).not.toThrow();
    expect(ChannelSchema.parse(raw).content_uid).toBe("a1b2c3d4e5f60718");
  });
  it("ChannelSchema remains valid without content_uid (optional)", () => {
    const raw = { id: "1", name: "BBC News", categoryId: "5" };
    expect(() => ChannelSchema.parse(raw)).not.toThrow();
    expect(ChannelSchema.parse(raw).content_uid).toBeUndefined();
  });
  it("VodItemSchema accepts content_uid when present", () => {
    const raw = {
      id: "42",
      name: "RRR",
      categoryId: "10",
      streamUrl: "http://host/vod/42.mkv",
      content_uid: "b2c3d4e5f6071819",
    };
    expect(() => VodItemSchema.parse(raw)).not.toThrow();
    expect(VodItemSchema.parse(raw).content_uid).toBe("b2c3d4e5f6071819");
  });
  it("VodItemSchema remains valid without content_uid", () => {
    const raw = {
      id: "42",
      name: "RRR",
      categoryId: "10",
      streamUrl: "http://host/vod/42.mkv",
    };
    expect(() => VodItemSchema.parse(raw)).not.toThrow();
  });
  it("SeriesPreviewSchema accepts content_uid when present", () => {
    const raw = {
      id: "9",
      name: "Breaking Bad",
      categoryId: "7",
      content_uid: "c3d4e5f607181920",
    };
    expect(() => SeriesPreviewSchema.parse(raw)).not.toThrow();
  });
  it("HistoryItemSchema accepts content_uid when present", () => {
    const raw = {
      id: 1,
      content_type: "vod" as const,
      content_id: 42,
      content_name: "RRR",
      content_icon: null,
      progress_seconds: 300,
      duration_seconds: 9000,
      watched_at: "2026-05-01T10:00:00Z",
      content_uid: "d4e5f60718192021",
    };
    expect(() => HistoryItemSchema.parse(raw)).not.toThrow();
    expect(HistoryItemSchema.parse(raw).content_uid).toBe("d4e5f60718192021");
  });
  it("HistoryItemSchema remains valid without content_uid", () => {
    const raw = {
      id: 1,
      content_type: "vod" as const,
      content_id: 42,
      content_name: null,
      content_icon: null,
      progress_seconds: 300,
      duration_seconds: 9000,
      watched_at: "2026-05-01T10:00:00Z",
    };
    expect(() => HistoryItemSchema.parse(raw)).not.toThrow();
  });
  it("FavoriteItemSchema accepts content_uid when present", () => {
    const raw = {
      id: 5,
      content_type: "series" as const,
      content_id: 9,
      content_name: "Breaking Bad",
      content_icon: null,
      category_name: "Drama",
      sort_order: 1,
      added_at: "2026-05-01T10:00:00Z",
      content_uid: "e5f6071819202122",
    };
    expect(() => FavoriteItemSchema.parse(raw)).not.toThrow();
  });
  it("EpgEntrySchema accepts content_uid when present", () => {
    const raw = {
      id: "e1",
      channelId: "ch1",
      title: "News",
      start: "2026-05-01T10:00:00Z",
      end: "2026-05-01T11:00:00Z",
      content_uid: "f60718192021222a",
    };
    expect(() => EpgEntrySchema.parse(raw)).not.toThrow();
  });
  it("CatalogItemSchema (search results) accepts content_uid when present", () => {
    const raw = {
      id: "10",
      name: "RRR",
      type: "vod" as const,
      categoryId: "5",
      content_uid: "07181920212223ab",
    };
    expect(() => CatalogItemSchema.parse(raw)).not.toThrow();
    expect(CatalogItemSchema.parse(raw).content_uid).toBe("07181920212223ab");
  });
  it("rejects invalid content_uid format on a schema", () => {
    const raw = {
      id: "1",
      name: "BBC News",
      categoryId: "5",
      content_uid: "NOT-VALID-HEX-!!",
    };
    expect(() => ChannelSchema.parse(raw)).toThrow();
  });
});

// ─── fetchStreamUrl uses content_uid when present ────────────────────────────

describe("fetchStreamUrl — content_uid routing", () => {
  it("uses content_uid as the path id when item has a content_uid", async () => {
    // Dynamic import so the test stays in module scope.
    const { buildStreamPath } = await import("./stream");
    const uid = "a1b2c3d4e5f60718";
    const path = buildStreamPath({ kind: "vod", id: "42", content_uid: uid });
    expect(path).toContain(uid);
    expect(path).not.toContain("42");
  });
  it("falls back to the numeric id when content_uid is absent", async () => {
    const { buildStreamPath } = await import("./stream");
    const path = buildStreamPath({ kind: "vod", id: "42" });
    expect(path).toContain("42");
  });
  it("uses content_uid for live channels too", async () => {
    const { buildStreamPath } = await import("./stream");
    const uid = "b1c2d3e4f5061718";
    const path = buildStreamPath({
      kind: "live",
      id: "705131",
      content_uid: uid,
    });
    expect(path).toContain(uid);
    expect(path).not.toContain("705131");
  });
});
