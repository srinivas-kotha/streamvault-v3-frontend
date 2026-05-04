import type { PlayerKind } from "./PlayerProvider";

/**
 * Classify a playback error so the failure overlay can render the right copy
 * and decide whether to memo a tier-lock hit (spec §9.2 / §9.3).
 *
 * Heuristics:
 *  - Backend returns HTTP 410 + `{ error: "DORMANT" }` when a content_uid is
 *    found in sv_content_master but has no row in sv_content_provider_map for
 *    the active provider. The useHlsPlayer HEAD probe detects 410 and sets
 *    the error message to include `"dormant:"` so this classifier picks it up.
 *    PlayerShell renders DormantContentOverlay instead of FailureOverlay.
 *  - VOD/series-episode that errors with zero duration + zero playhead, before
 *    any frame ever arrived, is almost always the Xtream account plan refusing
 *    the container extension → "tier-lock".
 *  - Backend returns HTTP 503 + `X-Stream-Status: offline` when the upstream
 *    provider has substituted an "FFmpeg Service" placeholder for the stream
 *    (live channel offline, OR the same placeholder hitting VOD / a series
 *    episode — confirmed in 2026-04-28 prod sample). Two paths surface that
 *    here:
 *      • mpegts.js exposes the raw HTTP error string for live → match `\b503\b`.
 *      • Native `<video>` swallows the status into MediaError; `useHlsPlayer`
 *        does a post-error HEAD probe for X-Stream-Status and re-sets the
 *        error message to include `"stream-offline:"` when it sees the header.
 *    Both paths land on the unified "stream-offline" class; PlayerShell's
 *    overlay copy then branches on the playback `kind` for live-vs-title
 *    wording.
 *  - Everything else → "generic".
 */
export type FailureClass =
  | "dormant"
  | "tier-lock"
  | "stream-offline"
  | "generic";

export function classifyFailure(
  kind: PlayerKind,
  duration: number,
  currentTime: number,
  errorMessage: string | undefined,
): FailureClass {
  if (errorMessage && errorMessage.includes("dormant:")) {
    return "dormant";
  }
  if (errorMessage && errorMessage.includes("stream-offline:")) {
    return "stream-offline";
  }
  if (kind === "live" && errorMessage && /\b503\b/.test(errorMessage)) {
    return "stream-offline";
  }
  if (kind !== "live" && duration === 0 && currentTime === 0) {
    return "tier-lock";
  }
  return "generic";
}
