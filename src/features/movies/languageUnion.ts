/**
 * languageUnion — resolves the set of movies for a given language filter.
 *
 * Movies has no `/api/vod/search`, so to show "all Telugu movies" we:
 *   1. Fetch /api/vod/categories once (module-level cache, 5-min TTL)
 *   2. Filter categories whose name matches the language (inferLanguage)
 *   3. Parallel-fetch /api/vod/streams/:id for each matching category
 *      (bounded concurrency — prevents backend fanout storms)
 *   4. Flatten, dedupe by stream id, return
 *
 * Per-category fetch failures are tolerated individually: one failing
 * category contributes zero streams instead of failing the whole union.
 *
 * Spec: docs/ux/03-movies.md §3 (client-side language union).
 */
import { fetchVodCategories, fetchVodStreams } from "../../api/vod";
import { inferLanguage } from "../../lib/inferLanguage";
import type { VodCategory, VodStream } from "../../api/schemas";
import type { LangId } from "../../lib/langPref";

const TTL_MS = 5 * 60 * 1000;
const MAX_CONCURRENCY = 8;

interface CacheEntry<T> {
  at: number;
  promise: Promise<T>;
}

let categoriesCache: CacheEntry<VodCategory[]> | null = null;
const streamsCache = new Map<string, CacheEntry<VodStream[]>>();

function fresh<T>(entry: CacheEntry<T> | null | undefined): Promise<T> | null {
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.promise;
}

/** Clear all caches — used by tests and (future) pull-to-refresh. */
export function invalidateLanguageUnionCache(): void {
  categoriesCache = null;
  streamsCache.clear();
}

/** Fetch /api/vod/categories, memoised module-wide with a 5-min TTL. */
export function getCategoriesCached(): Promise<VodCategory[]> {
  const hit = fresh(categoriesCache);
  if (hit) return hit;
  const promise = fetchVodCategories();
  categoriesCache = { at: Date.now(), promise };
  promise.catch(() => {
    // Do not poison the cache — allow the next call to retry.
    if (categoriesCache?.promise === promise) categoriesCache = null;
  });
  return promise;
}

/** Fetch /api/vod/streams/:id, memoised per category id with a 5-min TTL. */
export function getStreamsCached(categoryId: string): Promise<VodStream[]> {
  const hit = fresh(streamsCache.get(categoryId));
  if (hit) return hit;
  const promise = fetchVodStreams(categoryId);
  streamsCache.set(categoryId, { at: Date.now(), promise });
  promise.catch(() => {
    if (streamsCache.get(categoryId)?.promise === promise) {
      streamsCache.delete(categoryId);
    }
  });
  return promise;
}

/** True when a category should be included under the given language filter. */
export function categoryMatchesLang(cat: VodCategory, lang: LangId): boolean {
  if (lang === "all") return true;
  // Movies rail has no Sports chip (03-movies.md §4). A "sports" preference
  // leaks in only via legacy storage on the Live surface; treat as no-match.
  if (lang === "sports") return false;
  return inferLanguage(cat.name) === lang;
}

async function poolMap<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(concurrency, items.length);
  if (workerCount === 0) return results;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface LanguageUnionResult {
  streams: VodStream[];
  /** Number of categories matched by the language filter (for debug / UX copy). */
  matchedCategories: number;
}

/**
 * Fetch the union of streams across all categories matching `lang`.
 * Duplicates (same stream in multiple categories) are collapsed to one entry.
 */
export async function fetchLanguageUnion(
  lang: LangId,
): Promise<LanguageUnionResult> {
  const cats = await getCategoriesCached();
  const matching = cats.filter((c) => categoryMatchesLang(c, lang));

  const perCategory = await poolMap(matching, MAX_CONCURRENCY, async (c) => {
    try {
      return await getStreamsCached(c.id);
    } catch {
      return [] as VodStream[];
    }
  });

  const seen = new Set<string>();
  const merged: VodStream[] = [];
  for (const arr of perCategory) {
    for (const s of arr) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        merged.push(s);
      }
    }
  }

  return { streams: merged, matchedCategories: matching.length };
}
