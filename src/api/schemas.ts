import { z } from "zod";

/**
 * ContentUidSchema — 16-char lowercase hex string produced by sha1[:16] of the
 * canonical content title (see backend content-identity.service.ts).
 * Optional on all catalog/history/favorites shapes in Phase 3; becomes required
 * in Phase 4 after 30-day clean observation.
 */
export const ContentUidSchema = z.string().regex(/^[a-f0-9]{16}$/);
export type ContentUid = z.infer<typeof ContentUidSchema>;

/**
 * RatingSchema — the Xtream provider returns `rating` as any of:
 *   - a string ("3.8", "0")
 *   - a number (3.8, 0)
 *   - an integer (0)
 *   - null / missing
 * Empirical distribution from /api/vod/streams/240 (156 items):
 *   6 None, 5 float, 2 int, 143 str. If we declare `rating: z.string()`
 *   Zod rejects the whole array on the first number and the list silently
 *   renders as empty — the bug the user reported 2026-04-22 for Movies.
 * `z.preprocess` coerces numbers to strings BEFORE the inner validator,
 * keeping the parent-level inferred type as a plain optional string —
 * existing test mocks that omit `rating` stay valid under .infer.
 */
const RatingSchema = z.preprocess(
  (v) =>
    v === null || v === undefined
      ? undefined
      : typeof v === "number"
        ? String(v)
        : v,
  z.string().optional(),
);

/**
 * InferredLangSchema — language tag inferred server-side from the item's
 * category name (backend issue #52 / frontend PR #52 refactor).
 * Optional and nullable: null when no pattern matched, undefined when the
 * backend has not yet been updated (forward-compat with older deployments).
 */
const InferredLangSchema = z
  .enum(["telugu", "hindi", "english", "sports"])
  .nullable()
  .optional();

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

// Mirrors the backend CatalogItem shape returned by GET /api/live/channels
// (added 2026-04-22 — was missing until the post-merge smoke caught a 501).
// Fields that the v3 frontend tests originally expected (num/streamUrl/logo/
// epgChannelId) are kept optional so existing LiveRoute code compiles; num
// especially is derived client-side from array index when absent.
export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  categoryId: z.string(),
  icon: z.string().nullable().optional(),
  added: z.string().nullable().optional(),
  isAdult: z.boolean().optional(),
  rating: RatingSchema,
  genre: z.string().optional(),
  year: z.string().optional(),
  // Legacy fields — optional; fallback is handled at render time (num ?? index+1).
  num: z.number().optional(),
  streamUrl: z.string().url().optional(),
  logo: z.string().optional(),
  epgChannelId: z.string().optional(),
  /** Language inferred server-side from category name (backend PR #45 / frontend issue #52). */
  inferredLang: InferredLangSchema,
  /** Phase 3 content-identity: provider-stable content uid (optional until Phase 4). */
  content_uid: ContentUidSchema.optional(),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const EpgEntrySchema = z.object({
  id: z.string(),
  channelId: z.string(),
  title: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  description: z.string().optional(),
  /** Phase 3 content-identity: provider-stable content uid (optional until Phase 4). */
  content_uid: ContentUidSchema.optional(),
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
  /** Phase 3 content-identity: provider-stable content uid (optional until Phase 4). */
  content_uid: ContentUidSchema.optional(),
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
  /** Phase 3 content-identity: provider-stable content uid (optional until Phase 4). */
  content_uid: ContentUidSchema.optional(),
});
export type SeriesPreview = z.infer<typeof SeriesPreviewSchema>;

// ─── Series detail schemas ────────────────────────────────────────────────────
// Mirrors provider.types.ts SeasonInfo, EpisodeInfo, and CatalogItemDetail
// (the full shape returned by GET /api/series/info/:id via adaptSeriesInfo).

/**
 * SeasonInfoSchema — mirrors backend provider.types.ts SeasonInfo (lines 41–46).
 */
export const SeasonInfoSchema = z.object({
  seasonNumber: z.number(),
  name: z.string(),
  episodeCount: z.number(),
  icon: z.string().optional(),
});
export type SeasonInfo = z.infer<typeof SeasonInfoSchema>;

/**
 * EpisodeInfoSchema — mirrors backend provider.types.ts EpisodeInfo (lines 48–58).
 */
export const EpisodeInfoSchema = z.object({
  id: z.string(),
  episodeNumber: z.number(),
  title: z.string(),
  containerExtension: z.string().optional(),
  duration: z.number().optional(),
  plot: z.string().optional(),
  rating: z.string().optional(),
  icon: z.string().optional(),
  added: z.string().optional(),
});
export type EpisodeInfo = z.infer<typeof EpisodeInfoSchema>;

/**
 * SeriesInfoSchema — full detail shape from GET /api/series/info/:id.
 * Extends SeriesItemSchema with plot, backdropUrl, cast, director, seasons[],
 * and episodes keyed by season number string.
 * Mirrors backend CatalogItemDetail (provider.types.ts lines 60–71).
 */
export const SeriesInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  icon: z.string().nullable().optional(),
  added: z.string().nullable().optional(),
  isAdult: z.boolean().optional(),
  rating: RatingSchema,
  genre: z.string().optional(),
  year: z.string().optional(),
  // Detail-only fields
  plot: z.string().optional(),
  cast: z.string().optional(),
  director: z.string().optional(),
  backdropUrl: z.string().optional(),
  tmdbId: z.string().optional(),
  seasons: z.array(SeasonInfoSchema).optional(),
  episodes: z.record(z.string(), z.array(EpisodeInfoSchema)).optional(),
});
export type SeriesInfo = z.infer<typeof SeriesInfoSchema>;

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
  rating: RatingSchema,
  genre: z.string().optional(),
  year: z.string().optional(),
  /** Language inferred server-side from category name (backend PR #45 / frontend issue #52). */
  inferredLang: InferredLangSchema,
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
  rating: RatingSchema,
  genre: z.string().optional(),
  year: z.string().optional(),
  /** Language inferred server-side from category name (backend PR #45 / frontend issue #52). */
  inferredLang: InferredLangSchema,
  /** Phase 3 content-identity: provider-stable content uid (optional until Phase 4). */
  content_uid: ContentUidSchema.optional(),
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
  icon: z.string().nullable().optional(),
  added: z.string().nullable().optional(),
  isAdult: z.boolean().optional(),
  rating: RatingSchema,
  genre: z.string().optional(),
  year: z.string().optional(),
  /** Language inferred server-side from category name (backend PR #45 / frontend issue #52). */
  inferredLang: InferredLangSchema,
});
export type VodStream = z.infer<typeof VodStreamSchema>;

/**
 * VodInfoSchema — detail response from GET /api/vod/info/:id.
 *
 * Mirrors backend `CatalogItemDetail` from provider.types.ts. Every field
 * past `id` is optional because Xtream returns sparse data for many titles;
 * a strict schema would reject the whole payload whenever one field is
 * missing or loosely typed.
 *
 * `duration` is a DISPLAY STRING (e.g. "2h 15min") per the Xtream provider.
 * Earlier versions of this schema declared it as `z.number()` and every
 * `fetchVodInfo` call silently threw on parse — ResumeHero's title backfill
 * then fell back to "your movie" forever. Observed in prod 2026-04-23.
 * Use `durationSecs` for numeric computation.
 */
export const VodInfoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  plot: z.string().optional(),
  cast: z.string().optional(),
  director: z.string().optional(),
  genre: z.string().optional(),
  year: z.string().optional(),
  rating: RatingSchema,
  duration: z.string().optional(),
  durationSecs: z.number().optional(),
  backdropUrl: z.string().optional(),
  icon: z.string().nullable().optional(),
  containerExtension: z.string().optional(),
});
export type VodInfo = z.infer<typeof VodInfoSchema>;

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
  /** Phase 3 content-identity: provider-stable content uid (optional until Phase 4). */
  content_uid: ContentUidSchema.optional(),
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
  /**
   * Phase 3 content-identity: set by a DB trigger when content_uid transitions
   * NULL→non-NULL (i.e. when a dormant history item's content is found on the
   * new provider). Used as a sort key in Continue Watching to re-surface revived
   * content above older items (optional until Phase 4).
   */
  revived_at: z.string().optional(),
  /** Phase 3 content-identity: provider-stable content uid (optional until Phase 4). */
  content_uid: ContentUidSchema.optional(),
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

/**
 * StreamUrlSchema — used if the backend ever returns a JSON body with
 * a stream URL (current backend streams directly, no JSON wrapper).
 * Defined here for future use and type-safety.
 */
export const StreamUrlSchema = z.object({
  url: z.string().url(),
  format: z.enum(["m3u8", "ts", "mp4"]).optional(),
  isLive: z.boolean().optional(),
});
export type StreamUrl = z.infer<typeof StreamUrlSchema>;
