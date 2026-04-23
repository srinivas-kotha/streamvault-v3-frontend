/**
 * tierLockCache — per-session memo of "playback failed because the VOD's
 * containerExtension isn't in the account's allowedFormats".
 *
 * Spec: 03-movies.md §6 (Tier-locked card state) + §9 (Playback failure).
 * Best-effort only: containerExtension is on /api/vod/info/:id, not on
 * /api/vod/streams — we learn from the user hitting play and failing, and
 * then badge the card on the next focus.
 *
 * sessionStorage (not localStorage): tier entitlement can change mid-day
 * when the Xtream admin flips the account plan, so a fresh tab re-learns.
 */
const KEY = "sv_tierlock_cache";

type Cache = Record<string, true>;

function read(): Cache {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Cache;
    }
  } catch {
    // parse failure — treat as empty; next write re-initialises the slot
  }
  return {};
}

export function isTierLocked(vodId: string): boolean {
  return read()[vodId] === true;
}

export function markTierLocked(vodId: string): void {
  try {
    const current = read();
    current[vodId] = true;
    sessionStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // quota / restricted — degrade silently
  }
}

export function clearTierLockCache(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
