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
 * Phase 3 content-identity update:
 *  When a content item carries a `content_uid` (16-char hex), we send it as
 *  the path id. The backend stream.router.ts discriminates via isContentUid()
 *  and routes to resolveStreamUrl() directly, bypassing the legacy provider
 *  numeric-id lookup. This fixes episode plays (synthetic episode keys) and
 *  movies not in sv_content_provider_map under SV_USE_CONTENT_UID=1.
 *  Legacy numeric ids are still sent as a fallback when content_uid is absent.
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

interface BuildStreamPathOptions {
  kind: PlayerKind;
  /** Legacy numeric id (fallback when content_uid is absent). */
  id: string;
  /** Phase 3: 16-char hex content_uid. Preferred over numeric id. */
  content_uid?: string;
  season?: number;
  episode?: number;
}

// Keep backwards-compatible alias.
type FetchStreamUrlOptions = BuildStreamPathOptions;

const TYPE_MAP: Record<PlayerKind, string> = {
  live: "live",
  vod: "vod",
  "series-episode": "series",
};

/**
 * buildStreamPath — returns just the path portion `/api/stream/<type>/<id>`.
 * Exported for unit testing without the BASE_URL prefix.
 *
 * Prefers `content_uid` when present; falls back to legacy `id`.
 */
export function buildStreamPath({
  kind,
  id,
  content_uid,
}: BuildStreamPathOptions): string {
  const type = TYPE_MAP[kind];
  const resolvedId = content_uid ?? id;
  return `/api/stream/${type}/${encodeURIComponent(resolvedId)}`;
}

/**
 * fetchStreamUrl — full URL including BASE_URL, ready for hls.js / <video src>.
 *
 * Prefers `content_uid` when present; falls back to legacy numeric `id`.
 * The backend streams the content (no redirect, no JSON) at this URL.
 */
export function fetchStreamUrl({
  kind,
  id,
  content_uid,
}: FetchStreamUrlOptions): string {
  // exactOptionalPropertyTypes: only spread content_uid when defined.
  return `${BASE_URL}${buildStreamPath({ kind, id, ...(content_uid ? { content_uid } : {}) })}`;
}
