/**
 * VOD API client — thin wrapper around apiClient.
 * Mirrors src/api/live.ts shape exactly.
 */
import { z } from "zod";
import { apiClient } from "./client";
import {
  VodCategorySchema,
  VodInfoSchema,
  VodStreamSchema,
} from "./schemas";
import type { VodCategory, VodInfo, VodStream } from "./schemas";

export async function fetchVodCategories(): Promise<VodCategory[]> {
  const raw = await apiClient.get<unknown[]>("/api/vod/categories");
  return z.array(VodCategorySchema).parse(raw);
}

export async function fetchVodStreams(categoryId: string): Promise<VodStream[]> {
  const raw = await apiClient.get<unknown[]>(
    `/api/vod/streams/${encodeURIComponent(categoryId)}`,
  );
  return z.array(VodStreamSchema).parse(raw);
}

/**
 * Detail fetch for the bottom sheet (03-movies.md §7). The backend may
 * return a sparse record for titles Xtream has little data on; all fields
 * except id + name are optional. Callers should treat absent fields as
 * "unknown" rather than "empty".
 */
export async function fetchVodInfo(vodId: string): Promise<VodInfo> {
  const raw = await apiClient.get<unknown>(
    `/api/vod/info/${encodeURIComponent(vodId)}`,
  );
  return VodInfoSchema.parse(raw);
}
