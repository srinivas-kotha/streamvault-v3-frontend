/**
 * sortByActivity tests — TDD RED phase.
 * Tests the revived_at sort key for Continue Watching.
 * Written before implementation exists.
 */
import { describe, it, expect } from "vitest";
import { sortByActivity } from "./sortByActivity";
import type { HistoryItem } from "../../api/schemas";

function makeItem(
  overrides: Partial<HistoryItem> & { id: number },
): HistoryItem {
  return {
    content_type: "vod",
    content_id: overrides.id,
    content_name: `Title ${overrides.id}`,
    content_icon: null,
    progress_seconds: 100,
    duration_seconds: 9000,
    watched_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("sortByActivity", () => {
  it("sorts by watched_at descending when revived_at is absent", () => {
    const items = [
      makeItem({ id: 1, watched_at: "2026-01-01T00:00:00Z" }),
      makeItem({ id: 2, watched_at: "2026-01-03T00:00:00Z" }),
      makeItem({ id: 3, watched_at: "2026-01-02T00:00:00Z" }),
    ];
    const sorted = sortByActivity(items);
    expect(sorted.map((i) => i.content_id)).toEqual([2, 3, 1]);
  });

  it("a revived item with revived_at > watched_at sorts above items with later watched_at", () => {
    // Item A: watched 3 days ago, revived yesterday
    // Item B: watched yesterday (but not revived)
    // A's effective sort key = revived_at (yesterday), same as B's watched_at
    // When equal, insertion order wins — but revived_at should put A higher
    const itemA = makeItem({
      id: 1,
      watched_at: "2026-05-01T00:00:00Z", // 3 days ago
      revived_at: "2026-05-04T10:00:00Z", // today → should rank high
    });
    const itemB = makeItem({
      id: 2,
      watched_at: "2026-05-02T00:00:00Z", // 2 days ago, no revived_at
    });
    const sorted = sortByActivity([itemB, itemA]);
    // itemA's effective key (revived_at=2026-05-04) beats itemB (watched_at=2026-05-02)
    expect(sorted[0]!.content_id).toBe(1);
  });

  it("uses MAX(watched_at, revived_at) — watched_at is used when it is more recent than revived_at", () => {
    const itemA = makeItem({
      id: 1,
      watched_at: "2026-05-04T00:00:00Z", // today
      revived_at: "2026-04-01T00:00:00Z", // old revive
    });
    const itemB = makeItem({
      id: 2,
      watched_at: "2026-05-03T00:00:00Z", // yesterday
    });
    const sorted = sortByActivity([itemB, itemA]);
    // A's effective key = MAX(2026-05-04, 2026-04-01) = 2026-05-04 → ranks #1
    expect(sorted[0]!.content_id).toBe(1);
  });

  it("handles undefined revived_at gracefully (no crash)", () => {
    const items = [
      makeItem({ id: 1, watched_at: "2026-01-02T00:00:00Z" }),
      makeItem({
        id: 2,
        watched_at: "2026-01-01T00:00:00Z",
        revived_at: undefined,
      }),
    ];
    expect(() => sortByActivity(items)).not.toThrow();
    expect(sortByActivity(items)[0]!.content_id).toBe(1);
  });

  it("returns an empty array unchanged", () => {
    expect(sortByActivity([])).toEqual([]);
  });

  it("single item returns it unchanged", () => {
    const items = [makeItem({ id: 1 })];
    expect(sortByActivity(items)).toHaveLength(1);
  });
});
