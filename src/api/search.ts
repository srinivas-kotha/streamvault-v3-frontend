/**
 * search.ts — API module for GET /api/search
 *
 * Wraps the backend unified search endpoint. Returns results grouped by
 * content type (live / vod / series). Backend requires q.length >= 2
 * and performs server-side PostgreSQL FTS. Cookie auth + CSRF handled
 * by apiClient.
 */
import { apiClient } from "./client";
import { SearchResultsSchema, type SearchResults } from "./schemas";

export interface SearchOptions {
  /** Filter to a specific content type. Omit for all types. */
  type?: "live" | "vod" | "series";
  /** Hide adult content. Defaults to true (backend default). */
  hideAdult?: boolean;
}

/**
 * Fetch search results for `q`. Throws if q.length < 2 to prevent
 * unnecessary requests — matches backend validation.
 */
export async function fetchSearch(
  q: string,
  opts: SearchOptions = {},
): Promise<SearchResults> {
  if (q.length < 2) {
    throw new Error("Query must be at least 2 characters");
  }

  const params = new URLSearchParams({ q });
  if (opts.type) params.set("type", opts.type);
  if (opts.hideAdult === false) params.set("hideAdult", "false");

  const raw = await apiClient.get<unknown>(`/api/search?${params.toString()}`);
  return SearchResultsSchema.parse(raw);
}
