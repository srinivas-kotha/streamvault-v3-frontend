import { z } from "zod";
import { apiClient } from "./client";
import {
  ChannelSchema,
  EpgEntrySchema,
  type Channel,
  type EpgEntry,
} from "./schemas";

export async function fetchChannels(): Promise<Channel[]> {
  const raw = await apiClient.get<unknown[]>("/api/live/channels");
  return z.array(ChannelSchema).parse(raw);
}

export async function fetchChannelsByCategory(
  categoryId: string,
): Promise<Channel[]> {
  const raw = await apiClient.get<unknown[]>(
    `/api/live/channels?categoryId=${encodeURIComponent(categoryId)}`,
  );
  return z.array(ChannelSchema).parse(raw);
}

export async function fetchEpg(
  channelId: string,
  date?: string,
): Promise<EpgEntry[]> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const raw = await apiClient.get<unknown[]>(
    `/api/live/epg/${encodeURIComponent(channelId)}${qs}`,
  );
  return z.array(EpgEntrySchema).parse(raw);
}

export async function fetchCategories(): Promise<
  { id: string; name: string }[]
> {
  const raw = await apiClient.get<{ id: string; name: string }[]>(
    "/api/live/categories",
  );
  return raw;
}
