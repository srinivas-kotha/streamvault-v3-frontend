/**
 * history.ts — Watch History API client (Phase 8).
 *
 * Uses PUT /api/history/:contentId (upsert by user+type+id on the server).
 * Falls back to localStorage (`sv_history`) when the server is unreachable.
 *
 * localStorage is cleared on logout by `clearHistoryLocalStorage()`.
 */
import { z } from "zod";
import { apiClient } from "./client";
import {
  HistoryItemSchema,
  type HistoryItem,
  type RecordHistoryBody,
  type ContentType,
} from "./schemas";

const LS_KEY = "sv_history";
const MAX_LS_ITEMS = 50;

// ─── LocalStorage helpers ────────────────────────────────────────────────────

function lsRead(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return z.array(HistoryItemSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function lsWrite(items: HistoryItem[]): void {
  try {
    // Cap at MAX_LS_ITEMS, newest first.
    localStorage.setItem(
      LS_KEY,
      JSON.stringify(items.slice(0, MAX_LS_ITEMS)),
    );
  } catch {
    // quota exceeded — degrade silently
  }
}

export function clearHistoryLocalStorage(): void {
  localStorage.removeItem(LS_KEY);
}

// ─── API helpers ─────────────────────────────────────────────────────────────

/** Fetch the last 50 history items. Falls back to localStorage. */
export async function fetchHistory(): Promise<HistoryItem[]> {
  try {
    const raw = await apiClient.get<unknown[]>("/api/history");
    const items = z.array(HistoryItemSchema).parse(raw);
    lsWrite(items);
    return items;
  } catch {
    return lsRead();
  }
}

/**
 * Record / update a watch history entry. Uses PUT (upsert) on the backend.
 * Optimistic localStorage write occurs immediately before the server call.
 */
export async function recordHistory(
  contentId: number,
  body: RecordHistoryBody,
): Promise<void> {
  // Optimistic localStorage update.
  const now = new Date().toISOString();
  const existing = lsRead().filter(
    (h) => !(h.content_type === body.content_type && h.content_id === contentId),
  );
  const optimistic: HistoryItem = {
    id: -Date.now(),
    content_type: body.content_type,
    content_id: contentId,
    content_name: body.content_name ?? null,
    content_icon: body.content_icon ?? null,
    progress_seconds: body.progress_seconds,
    duration_seconds: body.duration_seconds,
    watched_at: now,
  };
  // Newest first.
  lsWrite([optimistic, ...existing]);

  try {
    await apiClient.put(`/api/history/${contentId}`, body);
  } catch {
    // localStorage already has the entry; leave it.
  }
}

/** Remove a single history item from localStorage (no backend DELETE in Phase 8). */
export function removeHistoryItem(
  contentId: number,
  contentType: ContentType,
): void {
  lsWrite(
    lsRead().filter(
      (h) => !(h.content_type === contentType && h.content_id === contentId),
    ),
  );
}

/** Human-readable "X ago" label. */
export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hr${diffHrs === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}
