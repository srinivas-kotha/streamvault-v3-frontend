/**
 * Per-route originator map — Netflix-style focus restoration.
 *
 * When a user activates a card on a list route and navigates to a detail
 * route, the list route records which card they came from. On pop back,
 * the list route consumes the saved focusKey and restores focus to it,
 * so the user lands exactly where they left.
 *
 * Keying: by the pathname of the LIST route (the route we'll return to
 * after the detail route is popped). Example:
 *   user on /series focuses SERIES_CARD_16420 → clicks →
 *   rememberOriginator('/series', 'SERIES_CARD_16420')
 *   → navigate('/series/16420')
 *   → user hits Back →
 *   /series mounts → consumeOriginator('/series') → setFocus(...)
 *
 * Consumers clear the entry on read so stale originators can't leak into
 * a later navigation. If the remembered focusKey no longer exists at
 * restore time (filter changed, list reloaded), the route's default
 * focus-seed logic applies.
 */
const originators = new Map<string, string>();

export function rememberOriginator(listRoute: string, focusKey: string): void {
  if (!listRoute || !focusKey) return;
  originators.set(listRoute, focusKey);
}

/** Read + delete. Returns null if no originator is stored for the route. */
export function consumeOriginator(listRoute: string): string | null {
  const key = originators.get(listRoute);
  if (key === undefined) return null;
  originators.delete(listRoute);
  return key;
}

/**
 * Wipe all stored originators. Called when the user taps a dock tab —
 * that's a deliberate fresh-start signal, so prior navigation state
 * should not influence focus on the destination.
 */
export function resetOriginators(): void {
  originators.clear();
}

/** Test-only inspector. */
export function __peekOriginatorForTest(listRoute: string): string | null {
  return originators.get(listRoute) ?? null;
}

/** Test-only size check. */
export function __sizeForTest(): number {
  return originators.size;
}
