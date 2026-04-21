import { z } from "zod";

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().optional(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().optional(),
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
