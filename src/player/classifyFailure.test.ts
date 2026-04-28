import { describe, it, expect } from "vitest";
import { classifyFailure } from "./classifyFailure";

describe("classifyFailure", () => {
  it("flags VOD with zero duration + zero playhead as tier-lock", () => {
    expect(classifyFailure("vod", 0, 0, "MEDIA_ERR_DECODE")).toBe("tier-lock");
  });

  it("does not flag VOD as tier-lock once duration loaded", () => {
    expect(classifyFailure("vod", 120, 0, "any")).toBe("generic");
  });

  it("flags live HTTP 503 (mpegts.js error string) as stream-offline", () => {
    expect(
      classifyFailure(
        "live",
        0,
        0,
        "NetworkError: Unrecoverable HTTP code: 503",
      ),
    ).toBe("stream-offline");
  });

  it("flags VOD with stream-offline marker (post-error HEAD probe) as stream-offline", () => {
    expect(
      classifyFailure(
        "vod",
        0,
        0,
        "stream-offline: upstream returned 503",
      ),
    ).toBe("stream-offline");
  });

  it("flags series-episode with stream-offline marker as stream-offline", () => {
    expect(
      classifyFailure(
        "series-episode",
        0,
        0,
        "stream-offline: upstream returned 503",
      ),
    ).toBe("stream-offline");
  });

  it("stream-offline marker takes priority over the tier-lock heuristic", () => {
    // Both conditions fire (zero duration + the marker); offline wins because
    // tier-lock copy would mislead the user into thinking it's a plan issue.
    expect(
      classifyFailure(
        "vod",
        0,
        0,
        "stream-offline: upstream returned 503",
      ),
    ).toBe("stream-offline");
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
