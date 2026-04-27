/**
 * favorites.ts — Favorites API client (Phase 8).
 *
 * All operations hit /api/favorites and fall back to localStorage when the
 * server is unreachable or returns a non-2xx status. The localStorage store
 * (`sv_favorites`) is keyed by `${content_type}:${content_id}` so O(1) lookup
 * works without re-parsing the array every time.
 *
 * localStorage is cleared on logout by `clearFavoritesLocalStorage()` — called
 * from auth.ts after successful /api/auth/logout.
 */
import { z } from "zod";
import { apiClient } from "./client";
import {
  FavoriteItemSchema,
  type FavoriteItem,
  type AddFavoriteBody,
  type ContentType,
} from "./schemas";

const LS_KEY = "sv_favorites";

// ─── LocalStorage helpers ────────────────────────────────────────────────────

function lsRead(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return z.array(FavoriteItemSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function lsWrite(items: FavoriteItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded — degrade silently
  }
}

export function clearFavoritesLocalStorage(): void {
  localStorage.removeItem(LS_KEY);
}

// ─── API helpers ─────────────────────────────────────────────────────────────

/** Fetch all favorites. Falls back to localStorage on network failure. */
export async function fetchFavorites(): Promise<FavoriteItem[]> {
  try {
    const raw = await apiClient.get<unknown[]>("/api/favorites");
    const items = z.array(FavoriteItemSchema).parse(raw);
    // Keep localStorage in sync so offline reads stay current.
    lsWrite(items);
    return items;
  } catch {
    return lsRead();
  }
}

/** Add a favorite. Optimistic localStorage write before the server call. */
export async function addFavorite(
  contentId: number,
  body: AddFavoriteBody,
): Promise<void> {
  // Optimistic: add to localStorage immediately.
  const existing = lsRead();
  const alreadyIn = existing.some(
    (f) => f.content_type === body.content_type && f.content_id === contentId,
  );
  if (!alreadyIn) {
    const optimistic: FavoriteItem = {
      id: -Date.now(), // temporary negative id
      content_type: body.content_type,
      content_id: contentId,
      content_name: body.content_name ?? null,
      content_icon: body.content_icon ?? null,
      category_name: body.category_name ?? null,
      sort_order: existing.length + 1,
      added_at: new Date().toISOString(),
    };
    lsWrite([...existing, optimistic]);
  }

  try {
    await apiClient.post(`/api/favorites/${contentId}`, body);
    // Re-sync with server truth after successful write.
    const fresh = await apiClient.get<unknown[]>("/api/favorites");
    lsWrite(z.array(FavoriteItemSchema).parse(fresh));
  } catch {
    // localStorage already has the optimistic entry; leave it.
  }
}

/** Remove a favorite. Optimistic localStorage removal before the server call. */
export async function removeFavorite(
  contentId: number,
  contentType: ContentType,
): Promise<void> {
  // Optimistic removal.
  lsWrite(
    lsRead().filter(
      (f) => !(f.content_type === contentType && f.content_id === contentId),
    ),
  );

  try {
    // DELETE /api/favorites/:contentId requires content_type in the body.
    // The ApiClient.delete() helper doesn't accept a body, so we use a raw
    // fetch call via the request path that handles CSRF automatically by
    // delegating through apiClient's internal request; however ApiClient
    // exposes no body-delete helper. We use a custom approach: POST-style
    // delete via the private `request` is inaccessible. Instead we send the
    // body via a custom fetch that mirrors ApiClient.request internals but
    // only for this DELETE case.
    const csrfMatch = document.cookie
      .split("; ")
      .find((c) => c.startsWith("sv_csrf="));
    const csrf = csrfMatch
      ? decodeURIComponent(csrfMatch.slice("sv_csrf=".length))
      : null;

    const baseUrl = import.meta.env.DEV ? "http://localhost:3001" : "";
    const url = `${import.meta.env.VITE_API_BASE_URL ?? baseUrl}/api/favorites/${contentId}`;

    await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ content_type: contentType }),
    });
  } catch {
    // localStorage already has optimistic removal; leave it.
  }
}

/** Check if an item is currently favorited (localStorage-only, synchronous). */
export function isFavorited(
  contentId: number,
  contentType: ContentType,
): boolean {
  return lsRead().some(
    (f) => f.content_type === contentType && f.content_id === contentId,
  );
}

/**
 * Delete every favorite. Returns the pre-clear snapshot so the caller can
 * pass it to `restoreAllFavorites()` if the user undoes within the toast
 * window. localStorage is cleared synchronously; per-item DELETEs are fired
 * in parallel and resolved best-effort. A partial server failure leaves the
 * server slightly out of sync until the next reload — acceptable for a bulk
 * destructive action that the user has already confirmed.
 */
export async function clearAllFavorites(): Promise<FavoriteItem[]> {
  const snapshot = lsRead();
  lsWrite([]);
  await Promise.allSettled(
    snapshot.map((f) => removeFavorite(f.content_id, f.content_type)),
  );
  return snapshot;
}

/**
 * Restore a snapshot returned by `clearAllFavorites()`. Writes the snapshot
 * back to localStorage synchronously, then issues per-item POSTs in
 * parallel. The frontend state is correct immediately; the server catches
 * up in the background.
 */
export async function restoreAllFavorites(
  snapshot: FavoriteItem[],
): Promise<void> {
  lsWrite(snapshot);
  await Promise.allSettled(
    snapshot.map((f) =>
      addFavorite(f.content_id, {
        content_type: f.content_type,
        ...(f.content_name ? { content_name: f.content_name } : {}),
        ...(f.content_icon ? { content_icon: f.content_icon } : {}),
        ...(f.category_name ? { category_name: f.category_name } : {}),
      }),
    ),
  );
}
