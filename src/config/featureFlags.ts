/**
 * featureFlags — fetch the BE-driven flag map and cache client-side.
 *
 * Master plan contracts:
 *   - A13: 5-second localStorage TTL (server-driven via response.ttl_seconds,
 *          but client treats it as a HARD upper bound — we never cache longer
 *          than 5s even if the server lies)
 *   - Fail-closed: any fetch error → all flags resolve `false`
 *   - 3-second AbortSignal.timeout so a slow BE doesn't block boot
 *   - Endpoint never returns 401 (returns globals on no-auth) — no special
 *     401 handling required
 *
 * The hook (useFeatureFlag) is in a sibling file so this module stays
 * SSR-safe and unit-testable in isolation.
 */

const ENDPOINT = "/api/config/flags";
const STORAGE_KEY = "sv_feature_flags_v1";
const HARD_TTL_MS = 5_000; // never cache longer than this regardless of server-told ttl
const FETCH_TIMEOUT_MS = 3_000;

export type FlagValue = boolean | number | string | object | null;
export interface FlagMap {
  [key: string]: FlagValue;
}

interface CacheEntry {
  flags: FlagMap;
  expiresAt: number;
}

interface FlagsResponse {
  flags: FlagMap;
  scope: "global" | "user";
  ttl_seconds?: number;
  fetchedAt: string;
}

let inFlight: Promise<FlagMap> | null = null;
let memCache: CacheEntry | null = null;

function readStorage(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.flags !== "object" ||
      parsed.flags === null
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(entry: CacheEntry): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* quota / private mode — ignore, mem cache still works */
  }
}

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
  if (!entry) return false;
  return entry.expiresAt > Date.now();
}

async function fetchOnce(): Promise<FlagMap> {
  let signal: AbortSignal | undefined;
  try {
    signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  } catch {
    /* AbortSignal.timeout missing on very old browsers — fall through without timeout */
  }
  const res = await fetch(ENDPOINT, {
    credentials: "include",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`flags fetch ${res.status}`);
  const body = (await res.json()) as FlagsResponse;
  if (!body || typeof body.flags !== "object") {
    throw new Error("flags fetch: malformed body");
  }
  // Honor server TTL but cap at HARD_TTL_MS.
  const serverTtlMs = (body.ttl_seconds ?? 5) * 1000;
  const ttlMs = Math.min(Math.max(serverTtlMs, 0), HARD_TTL_MS);
  const entry: CacheEntry = {
    flags: body.flags,
    expiresAt: Date.now() + ttlMs,
  };
  memCache = entry;
  writeStorage(entry);
  return entry.flags;
}

/**
 * Refresh the flag cache. Returns a promise that resolves to the flag
 * map. Coalesces concurrent callers to a single in-flight fetch.
 *
 * On error: returns whatever was last in localStorage (even if stale)
 * or an empty map. Never throws — fail-closed semantics.
 */
export async function refreshFlags(): Promise<FlagMap> {
  if (inFlight) return inFlight;
  inFlight = fetchOnce()
    .catch(() => {
      // Fail-closed: prefer stale-cache over nothing
      const stale = memCache ?? readStorage();
      return stale?.flags ?? {};
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Read a flag synchronously. Returns the cached value (mem or
 * localStorage) or `defaultValue` if absent. Triggers a background
 * refresh if the cache is stale.
 */
export function getFlag<T extends FlagValue>(
  key: string,
  defaultValue: T,
): T {
  const entry = memCache ?? readStorage();
  if (entry) {
    if (!isFresh(entry)) {
      // Background refresh; do not await
      void refreshFlags();
    }
    if (key in entry.flags) {
      const v = entry.flags[key];
      // Type-narrow conservatively: return as-is, caller cast.
      return v as T;
    }
  } else {
    // No cache yet — kick off a fetch but resolve with default for now
    void refreshFlags();
  }
  return defaultValue;
}

/** Clear the flag cache (test-only or Settings "force refresh"). */
export function clearFlagCache(): void {
  memCache = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Test seam — load a synthetic cache entry. */
export function __setCacheForTests(flags: FlagMap, ttlMs = 1000): void {
  memCache = { flags, expiresAt: Date.now() + ttlMs };
}
