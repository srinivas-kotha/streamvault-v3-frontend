/**
 * VOD API client — thin wrapper around apiClient.
 * Mirrors src/api/live.ts shape exactly.
 */
import { z } from "zod";
import { apiClient } from "./client";
import { VodCategorySchema, VodStreamSchema } from "./schemas";
import type { VodCategory, VodStream } from "./schemas";

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
