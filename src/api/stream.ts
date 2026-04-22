/**
 * stream.ts — stream URL construction for live/vod/series.
 *
 * Backend contract (verified against /home/crawler/streamvault-backend/src/routers/stream.router.ts):
 *  - GET /api/stream/live/:channelId  — streams live channel (m3u8 or ts)
 *  - GET /api/stream/vod/:vodId       — streams VOD item
 *  - GET /api/stream/series/:seriesId — streams series episode
 *    (season/episode encoded in the id by convention; backend resolves via provider)
 *
 * The backend uses a server-side proxy (CORS-safe, auth via cookies).
 * We construct the URL directly — no extra fetch needed, the backend
 * streams the content at this URL.
 *
 * NOTE: The backend stream.router.ts at /:type/:id expects a numeric ID.
 * The URL is constructed here and fed directly to hls.js / <video src>.
 *
 * For series episodes with season/episode, we encode them as query params
 * (the backend provider uses the stream ID from the database, so season/episode
 * are for display/logging only at this layer — the actual episode stream ID
 * is passed as :id).
 *
 * Thumbnail VTT previews: backend does NOT expose a VTT sprite endpoint.
 * TODO: Add WebVTT thumbnail support when backend adds /api/thumbnails/:id.
 */
import type { PlayerKind } from "../player/PlayerProvider";

const BASE_URL = import.meta.env.DEV ? "http://localhost:3001" : "";

interface FetchStreamUrlOptions {
  kind: PlayerKind;
  id: string;
  season?: number;
  episode?: number;
}

/**
 * Builds the proxied stream URL for a given content item.
 * Returns a URL string that can be passed directly to hls.js or <video>.
 *
 * The backend streams the content (no redirect, no JSON) at this URL,
 * so we return the URL for the player to load directly.
 */
export function fetchStreamUrl({
  kind,
  id,
}: FetchStreamUrlOptions): string {
  const typeMap: Record<PlayerKind, string> = {
    live: "live",
    vod: "vod",
    "series-episode": "series",
  };
  const type = typeMap[kind];
  return `${BASE_URL}/api/stream/${type}/${encodeURIComponent(id)}`;
}
