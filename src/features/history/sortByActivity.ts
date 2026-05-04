/**
 * sortByActivity — sort key for Continue Watching (Phase 3 content-identity).
 *
 * Sort key: MAX(watched_at, revived_at ?? watched_at)
 *
 * Why: When a dormant history row has its content_uid matched by the Phase 2
 * backfill trigger, `revived_at` is stamped with NOW(). This means a title the
 * user watched months ago can "come back" to the top of Continue Watching when
 * it reappears on the provider — exactly the "library analogy" the spec describes.
 *
 * Without this, a revived item (watched_at = old, revived_at = today) would stay
 * buried below items the user watched yesterday, and the revival would be invisible.
 */
import type { HistoryItem } from "../../api/schemas";

/**
 * Returns the effective activity timestamp for a history item.
 * Uses MAX(watched_at, revived_at) so revived items surface above old items.
 */
function effectiveActivityAt(item: HistoryItem): number {
  const watchedMs = new Date(item.watched_at).getTime();
  const revivedMs = item.revived_at
    ? new Date(item.revived_at).getTime()
    : -Infinity;
  return Math.max(watchedMs, revivedMs);
}

/**
 * Sort history items by effective activity descending (most recent first).
 * Does NOT mutate the input array.
 */
export function sortByActivity(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort(
    (a, b) => effectiveActivityAt(b) - effectiveActivityAt(a),
  );
}
