import { z } from "zod";

// Backend auth is cookie-based (httpOnly access_token / refresh_token cookies).
// /api/auth/login returns only a confirmation body; the session itself lives in
// cookies set by the Set-Cookie header. The frontend must NOT expect JWT strings
// in the response body — see streamvault-backend src/routers/auth.router.ts.
export const LoginResponseSchema = z.object({
  message: z.string(),
  userId: z.number(),
  username: z.string(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// /api/auth/refresh rotates cookies and returns `{ message: "Tokens refreshed" }`.
export const RefreshResponseSchema = z.object({
  message: z.string(),
});

export const ChannelSchema = z.object({
  id: z.string(),
  num: z.number(),
  name: z.string(),
  categoryId: z.string(),
  streamUrl: z.string().url(),
  logo: z.string().optional(),
  epgChannelId: z.string().optional(),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const EpgEntrySchema = z.object({
  id: z.string(),
  channelId: z.string(),
  title: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  description: z.string().optional(),
});
export type EpgEntry = z.infer<typeof EpgEntrySchema>;

export const VodItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  streamUrl: z.string().url(),
  posterUrl: z.string().optional(),
  rating: z.number().optional(),
  addedAt: z.string().datetime().optional(),
});
export type VodItem = z.infer<typeof VodItemSchema>;

// Preview shape (list-view cards only). Phase 6 adds full SeriesSchema with
// streamUrl, cover, plot, cast, genre, releaseDate, rating.
export const SeriesPreviewSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  posterUrl: z.string().optional(),
  seasons: z.number().optional(),
});
export type SeriesPreview = z.infer<typeof SeriesPreviewSchema>;

// ─── Phase 6: Series browse schemas ─────────────────────────────────────────

/**
 * SeriesCategory — shape returned by GET /api/series/categories.
 * Mirrors the backend CatalogCategory / XtreamCategory type.
 */
export const SeriesCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable().optional(),
  type: z.string().optional(),
  count: z.number().optional(),
});
export type SeriesCategory = z.infer<typeof SeriesCategorySchema>;

/**
 * SeriesItem — shape returned by GET /api/series/list/:categoryId.
 * Mirrors the backend CatalogItem / XtreamSeriesItem type.
 */
export const SeriesItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  categoryId: z.string(),
  /** Poster / cover image URL — nullable from provider. */
  icon: z.string().nullable().optional(),
  added: z.string().nullable().optional(),
  isAdult: z.boolean().optional(),
  rating: z.string().optional(),
  genre: z.string().optional(),
  year: z.string().optional(),
});
export type SeriesItem = z.infer<typeof SeriesItemSchema>;

export const UserMeSchema = z.object({
  id: z.number(),
  username: z.string(),
  role: z.enum(["admin", "user"]),
});
export type UserMe = z.infer<typeof UserMeSchema>;

// ─── Search ──────────────────────────────────────────────────────────────────

// CatalogItem matches the backend provider.types.ts CatalogItem shape returned
// by GET /api/search. `type` is "live" | "vod" | "series" (ContentType).
export const CatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["live", "vod", "series"]),
  categoryId: z.string(),
  icon: z.string().nullable().optional(),
  added: z.string().nullable().optional(),
  isAdult: z.boolean().optional(),
  rating: z.string().optional(),
  genre: z.string().optional(),
  year: z.string().optional(),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

// SearchResults — the top-level response shape from GET /api/search.
// Keys map to content type sections; each is an array of CatalogItems.
export const SearchResultsSchema = z.object({
  live: z.array(CatalogItemSchema),
  vod: z.array(CatalogItemSchema),
  series: z.array(CatalogItemSchema),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;

// ─── VOD ─────────────────────────────────────────────────────────────────────
// Mirrors provider.types.ts CatalogCategory / CatalogItem on the backend.

export const VodCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  type: z.literal("vod"),
  count: z.number().optional(),
});
export type VodCategory = z.infer<typeof VodCategorySchema>;

export const VodStreamSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal("vod"),
  categoryId: z.string(),
  icon: z.string().nullable(),
  added: z.string().nullable().optional(),
  isAdult: z.boolean(),
  rating: z.string().optional(),
  genre: z.string().optional(),
  year: z.string().optional(),
});
export type VodStream = z.infer<typeof VodStreamSchema>;

// ─── Favorites ──────────────────────────────────────────────────────────────

/** Content types the backend recognises. "live" is normalised to "channel" server-side. */
export const ContentTypeSchema = z.enum(["channel", "vod", "series"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const FavoriteItemSchema = z.object({
  id: z.number(),
  content_type: ContentTypeSchema,
  content_id: z.number(),
  content_name: z.string().nullable(),
  content_icon: z.string().nullable(),
  category_name: z.string().nullable(),
  sort_order: z.number(),
  added_at: z.string(),
});
export type FavoriteItem = z.infer<typeof FavoriteItemSchema>;

export const AddFavoriteBodySchema = z.object({
  content_type: ContentTypeSchema,
  content_name: z.string().optional(),
  content_icon: z.string().optional(),
  category_name: z.string().optional(),
});
export type AddFavoriteBody = z.infer<typeof AddFavoriteBodySchema>;

// ─── Watch History ────────────────────────────────────────────────────────

export const HistoryItemSchema = z.object({
  id: z.number(),
  content_type: ContentTypeSchema,
  content_id: z.number(),
  content_name: z.string().nullable(),
  content_icon: z.string().nullable(),
  progress_seconds: z.number(),
  duration_seconds: z.number(),
  watched_at: z.string(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const RecordHistoryBodySchema = z.object({
  content_type: ContentTypeSchema,
  content_name: z.string().optional(),
  content_icon: z.string().optional(),
  progress_seconds: z.number(),
  duration_seconds: z.number(),
});
export type RecordHistoryBody = z.infer<typeof RecordHistoryBodySchema>;
