import { describe, it, expect } from "vitest";
import { classifyFailure } from "./classifyFailure";

describe("classifyFailure", () => {
  it("flags VOD with zero duration + zero playhead as tier-lock", () => {
    expect(classifyFailure("vod", 0, 0, "MEDIA_ERR_DECODE")).toBe("tier-lock");
  });

  it("does not flag VOD as tier-lock once duration loaded", () => {
    expect(classifyFailure("vod", 120, 0, "any")).toBe("generic");
  });

  it("flags live HTTP 503 as live-offline", () => {
    expect(
      classifyFailure(
        "live",
        0,
        0,
        "NetworkError: Unrecoverable HTTP code: 503",
      ),
    ).toBe("live-offline");
  });

  it("falls back to generic for live without 503 in message", () => {
    expect(classifyFailure("live", 0, 0, "NetworkError")).toBe("generic");
  });

  it("does not match '503' as a substring (e.g. inside another number)", () => {
    expect(classifyFailure("live", 0, 0, "code 5031")).toBe("generic");
  });

  it("returns generic when error message is undefined", () => {
    expect(classifyFailure("live", 0, 0, undefined)).toBe("generic");
  });
});
