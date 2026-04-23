/**
 * seriesLanguageUnion — language-union fetcher for the /series list, mirroring
 * the Movies version (`features/movies/languageUnion.ts`).
 *
 *   1. Fetch /api/series/categories once (5-min TTL cache)
 *   2. Filter categories whose name matches the language (via shared
 *      `inferLanguage` patterns — broader than Movies' word-boundary regex)
 *   3. Parallel-fetch /api/series/list/:id for each match (bounded concurrency)
 *   4. Flatten, dedupe by series id, return progressively so the grid can
 *      render as each category resolves.
 *
 * Per-category failures are swallowed (contribute zero items) rather than
 * failing the whole union — a single flaky category shouldn't hide the rest.
 *
 * Spec: docs/ux/02-series.md §6.1 — "Same union as Movies. Cache 5min."
 */
import { fetchSeriesCategories, fetchSeriesList } from "../../api/series";
import type { SeriesCategory, SeriesItem } from "../../api/schemas";
import type { LangId } from "../../lib/langPref";
import { inferLanguage } from "../../lib/inferLanguage";

const TTL_MS = 5 * 60 * 1000;
const MAX_CONCURRENCY = 8;

interface CacheEntry<T> {
  at: number;
  promise: Promise<T>;
}

let categoriesCache: CacheEntry<SeriesCategory[]> | null = null;
const listCache = new Map<string, CacheEntry<SeriesItem[]>>();

const resolvedSeriesIndex = new Map<string, SeriesItem>();

export function lookupCachedSeries(id: string): SeriesItem | undefined {
  return resolvedSeriesIndex.get(id);
}

function fresh<T>(entry: CacheEntry<T> | null | undefined): Promise<T> | null {
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.promise;
}

export function invalidateSeriesLanguageUnionCache(): void {
  categoriesCache = null;
  listCache.clear();
  resolvedSeriesIndex.clear();
}

export function getSeriesCategoriesCached(): Promise<SeriesCategory[]> {
  const hit = fresh(categoriesCache);
  if (hit) return hit;
  const promise = fetchSeriesCategories();
  categoriesCache = { at: Date.now(), promise };
  promise.catch(() => {
    if (categoriesCache?.promise === promise) categoriesCache = null;
  });
  return promise;
}

export function getSeriesListCached(categoryId: string): Promise<SeriesItem[]> {
  const hit = fresh(listCache.get(categoryId));
  if (hit) return hit;
  const promise = fetchSeriesList(categoryId).then((items) => {
    for (const s of items) resolvedSeriesIndex.set(s.id, s);
    return items;
  });
  listCache.set(categoryId, { at: Date.now(), promise });
  promise.catch(() => {
    if (listCache.get(categoryId)?.promise === promise) {
      listCache.delete(categoryId);
    }
  });
  return promise;
}

// Uses the shared `inferLanguage` pattern set (mirrors the backend service) so
// a Hindi filter picks up "Bollywood Classics" / "Indian Series", English
// picks up "Netflix Originals" / "HBO Series", etc. The narrower word-boundary
// match used in the Movies union (features/movies/languageUnion.ts) drops
// those categories — we intentionally diverge here per user ask "get
// everything of telugu". `inferLanguage` is the authoritative source because
// it matches what the backend attaches as `inferredLang` to each item.
export function categoryMatchesLang(
  cat: SeriesCategory,
  lang: LangId,
): boolean {
  if (lang === "all") return true;
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

export interface SeriesLanguageUnionBatch {
  items: SeriesItem[];
  isFinal: boolean;
  matchedCategories: number;
  completedCategories: number;
}

/**
 * Progressive fetch — fires `onBatch` every time a matching category resolves,
 * with the accumulated deduped series items. First batch typically arrives
 * within one RTT so the grid can render while remaining categories trickle
 * in silently.
 */
export async function streamSeriesLanguageUnion(
  lang: LangId,
  onBatch: (batch: SeriesLanguageUnionBatch) => void,
): Promise<void> {
  const cats = await getSeriesCategoriesCached();
  const matching = cats.filter((c) => categoryMatchesLang(c, lang));

  if (matching.length === 0) {
    onBatch({
      items: [],
      isFinal: true,
      matchedCategories: 0,
      completedCategories: 0,
    });
    return;
  }

  const seen = new Set<string>();
  const merged: SeriesItem[] = [];
  let completed = 0;

  await poolMap(matching, MAX_CONCURRENCY, async (c) => {
    try {
      const items = await getSeriesListCached(c.id);
      for (const s of items) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          merged.push(s);
        }
      }
    } catch {
      // per-category failures contribute zero items
    }
    completed += 1;
    const isFinal = completed === matching.length;
    onBatch({
      items: merged.slice(),
      isFinal,
      matchedCategories: matching.length,
      completedCategories: completed,
    });
  });
}
