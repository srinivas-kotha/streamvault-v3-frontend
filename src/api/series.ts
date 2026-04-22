import { z } from "zod";
import { apiClient } from "./client";
import {
  SeriesCategorySchema,
  SeriesItemSchema,
  SeriesInfoSchema,
  type SeriesCategory,
  type SeriesItem,
  type SeriesInfo,
} from "./schemas";

/**
 * Fetch all series categories.
 * Endpoint: GET /api/series/categories
 */
export async function fetchSeriesCategories(): Promise<SeriesCategory[]> {
  const raw = await apiClient.get<unknown[]>("/api/series/categories");
  return z.array(SeriesCategorySchema).parse(raw);
}

/**
 * Fetch series list for a given category.
 * Endpoint: GET /api/series/list/:categoryId
 */
export async function fetchSeriesList(categoryId: string): Promise<SeriesItem[]> {
  const raw = await apiClient.get<unknown[]>(
    `/api/series/list/${encodeURIComponent(categoryId)}`,
  );
  return z.array(SeriesItemSchema).parse(raw);
}

/**
 * Fetch full series info including seasons + episodes.
 * Endpoint: GET /api/series/info/:id
 */
export async function fetchSeriesInfo(seriesId: string): Promise<SeriesInfo> {
  const raw = await apiClient.get<unknown>(
    `/api/series/info/${encodeURIComponent(seriesId)}`,
  );
  return SeriesInfoSchema.parse(raw);
}
