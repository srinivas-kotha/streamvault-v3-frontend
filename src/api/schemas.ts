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

export const UserMeSchema = z.object({
  id: z.number(),
  username: z.string(),
  role: z.enum(["admin", "user"]),
});
export type UserMe = z.infer<typeof UserMeSchema>;
