import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchChannels, fetchEpg } from "./live";
import { apiClient } from "./client";

describe("live API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchChannels returns typed Channel array", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue([
      {
        id: "1",
        num: 101,
        name: "BBC",
        categoryId: "5",
        streamUrl: "http://x.m3u8",
      },
    ]);
    const result = await fetchChannels();
    expect(result[0]?.name).toBe("BBC");
  });

  it("fetchChannels throws on invalid API shape", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue([{ invalid: true }]);
    await expect(fetchChannels()).rejects.toThrow();
  });

  it("fetchEpg returns typed EpgEntry array", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue([
      {
        id: "e1",
        channelId: "1",
        title: "News at 10",
        start: "2026-04-21T22:00:00.000Z",
        end: "2026-04-21T22:30:00.000Z",
      },
    ]);
    const result = await fetchEpg("1");
    expect(result[0]?.title).toBe("News at 10");
  });
});
