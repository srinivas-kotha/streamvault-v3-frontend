import { z } from "zod";
import { apiClient } from "./client";
import {
  SeriesCategorySchema,
  SeriesItemSchema,
  type SeriesCategory,
  type SeriesItem,
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
