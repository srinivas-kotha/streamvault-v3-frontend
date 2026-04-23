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
import type { VodCategory, VodStream } from "../../api/schemas";
import type { LangId } from "../../lib/langPref";
import { isOttPlatform, seriesNameMatchesLang } from "../../lib/inferLanguage";

const TTL_MS = 5 * 60 * 1000;
const MAX_CONCURRENCY = 8;

interface CacheEntry<T> {
  at: number;
  promise: Promise<T>;
}

let categoriesCache: CacheEntry<VodCategory[]> | null = null;
const streamsCache = new Map<string, CacheEntry<VodStream[]>>();

// Sync (id → VodStream) index populated as streamsCache promises resolve.
// Used by MoviesRoute to look up a resume-candidate's name without a round
// trip whenever any category containing that id has already been fetched
// (e.g., the user paused a Hindi movie, the Hindi union ran, the name is
// now in this index and available on the Telugu view too).
const resolvedStreamsIndex = new Map<string, VodStream>();

export function lookupCachedStream(id: string): VodStream | undefined {
  return resolvedStreamsIndex.get(id);
}

function fresh<T>(entry: CacheEntry<T> | null | undefined): Promise<T> | null {
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.promise;
}

/** Clear all caches — used by tests and (future) pull-to-refresh. */
export function invalidateLanguageUnionCache(): void {
  categoriesCache = null;
  streamsCache.clear();
  resolvedStreamsIndex.clear();
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
  const promise = fetchVodStreams(categoryId).then((items) => {
    // Populate the sync lookup index as soon as the fetch resolves.
    for (const s of items) resolvedStreamsIndex.set(s.id, s);
    return items;
  });
  streamsCache.set(categoryId, { at: Date.now(), promise });
  promise.catch(() => {
    if (streamsCache.get(categoryId)?.promise === promise) {
      streamsCache.delete(categoryId);
    }
  });
  return promise;
}

/**
 * Strict, mutually-exclusive language detection for category NAMES.
 *
 * Unlike the broader `inferLanguage` used for post-query search annotation,
 * this filter is intentionally narrow:
 *   1. Word-boundary matching on the primary language name (e.g. `\btelugu\b`)
 *      so "Bollywood" doesn't accidentally match a Telugu filter.
 *   2. Multi-language categories are rejected — if a category mentions TWO
 *      or more of {telugu, hindi, english} as words, it is ambiguous and
 *      included under NONE of them. This keeps "Telugu Dubbed Hindi",
 *      "Indian Telugu", etc. out of every language-specific view.
 *
 * Reason: the Xtream provider's category names are noisy. Loose substring
 * matching leaked Hindi titles into Telugu view (observed 2026-04-23: Bhediya,
 * Adipurush under Telugu). Strict matching prefers correctness over recall —
 * ambiguous categories are still reachable under "All".
 */
const LANG_WORDS: Record<"telugu" | "hindi" | "english", RegExp> = {
  telugu: /\btelugu\b/i,
  hindi: /\bhindi\b/i,
  english: /\benglish\b/i,
};

export function categoryMatchesLang(cat: VodCategory, lang: LangId): boolean {
  if (lang === "all") return true;
  // Movies rail has no Sports chip (03-movies.md §4). Treat as no-match.
  if (lang === "sports") return false;

  const name = cat.name;
  const target = LANG_WORDS[lang];
  if (!target.test(name)) return false;

  // Reject ambiguous categories mentioning another language word.
  for (const otherLang of ["telugu", "hindi", "english"] as const) {
    if (otherLang === lang) continue;
    if (LANG_WORDS[otherLang].test(name)) return false;
  }
  return true;
}

/**
 * Categories are classified the same way as series (see
 * `features/series/seriesLanguageUnion.ts`):
 *
 *   pure-lang    — category name uniquely identifies the language
 *   ott-platform — multi-language catalogue; each item is filtered by name
 *
 * Pure-lang uses the strict word-boundary `categoryMatchesLang` to avoid
 * Hindi titles leaking under Telugu (see top-of-file comment on
 * `LANG_WORDS`). OTT platforms are identified via the shared pattern set so
 * Movies and Series stay consistent.
 */
export type MovieCategoryBucket = "pure-lang" | "ott-platform";

export function classifyMovieCategory(
  cat: VodCategory,
  lang: LangId,
): MovieCategoryBucket | null {
  if (lang === "all") {
    return categoryMatchesLang(cat, lang) || isOttPlatform(cat.name)
      ? "pure-lang"
      : null;
  }
  if (lang === "sports") return null;
  if (categoryMatchesLang(cat, lang)) return "pure-lang";
  if (isOttPlatform(cat.name)) return "ott-platform";
  return null;
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
 *
 * Single-shot version: resolves once with the full result. Prefer
 * `streamLanguageUnion` in UI code so partial results can render quickly.
 */
export async function fetchLanguageUnion(
  lang: LangId,
): Promise<LanguageUnionResult> {
  const cats = await getCategoriesCached();
  const classified: { cat: VodCategory; bucket: MovieCategoryBucket }[] = [];
  for (const c of cats) {
    const bucket = classifyMovieCategory(c, lang);
    if (bucket) classified.push({ cat: c, bucket });
  }

  const perCategory = await poolMap(
    classified,
    MAX_CONCURRENCY,
    async ({ cat, bucket }) => {
      try {
        const items = await getStreamsCached(cat.id);
        // OTT platforms are multi-language — filter by item name.
        return bucket === "ott-platform"
          ? items.filter((s) => seriesNameMatchesLang(s.name, lang))
          : items;
      } catch {
        return [] as VodStream[];
      }
    },
  );

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

  return { streams: merged, matchedCategories: classified.length };
}

export interface LanguageUnionBatch {
  streams: VodStream[];
  isFinal: boolean;
  matchedCategories: number;
  completedCategories: number;
}

/**
 * Progressive variant of {@link fetchLanguageUnion}. Fires `onBatch` each
 * time a matching category resolves, carrying the accumulated deduped
 * streams. The first batch typically arrives within one network RTT, so
 * the grid can render while the remaining categories trickle in silently.
 *
 * Spec rationale (user feedback 2026-04-23 PM): Hindi waited 3-5s before
 * showing ANY posters; the "Loading Hindi movies…" state felt like the
 * click didn't register. Progressive rendering dismisses the loader on
 * first batch and the remaining cards stream in over the next few seconds.
 */
export async function streamLanguageUnion(
  lang: LangId,
  onBatch: (batch: LanguageUnionBatch) => void,
): Promise<void> {
  const cats = await getCategoriesCached();
  const classified: { cat: VodCategory; bucket: MovieCategoryBucket }[] = [];
  for (const c of cats) {
    const bucket = classifyMovieCategory(c, lang);
    if (bucket) classified.push({ cat: c, bucket });
  }

  if (classified.length === 0) {
    onBatch({
      streams: [],
      isFinal: true,
      matchedCategories: 0,
      completedCategories: 0,
    });
    return;
  }

  const seen = new Set<string>();
  const merged: VodStream[] = [];
  let completed = 0;

  await poolMap(classified, MAX_CONCURRENCY, async ({ cat, bucket }) => {
    try {
      const items = await getStreamsCached(cat.id);
      for (const s of items) {
        if (seen.has(s.id)) continue;
        if (bucket === "ott-platform" && !seriesNameMatchesLang(s.name, lang)) {
          continue;
        }
        seen.add(s.id);
        merged.push(s);
      }
    } catch {
      // per-category failures contribute zero streams
    }
    completed += 1;
    const isFinal = completed === classified.length;
    // Shallow copy so React's setState sees a new reference.
    onBatch({
      streams: merged.slice(),
      isFinal,
      matchedCategories: classified.length,
      completedCategories: completed,
    });
  });
}
