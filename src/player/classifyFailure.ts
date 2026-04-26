import type { PlayerKind } from "./PlayerProvider";

/**
 * Classify a playback error so the failure overlay can render the right copy
 * and decide whether to memo a tier-lock hit (spec §9.2 / §9.3).
 *
 * Heuristics:
 *  - VOD/series-episode that errors with zero duration + zero playhead, before
 *    any frame ever arrived, is almost always the Xtream account plan refusing
 *    the container extension → "tier-lock".
 *  - Live channels: backend returns HTTP 503 + X-Stream-Status: offline when
 *    the upstream provider redirects to its "channel offline" placeholder
 *    (a 6 MB looped MPEG-TS splash). mpegts.js surfaces that as an error
 *    string containing "503" — match on it so the overlay can say
 *    "Channel offline" instead of generic "couldn't be played right now".
 *  - Everything else → "generic".
 */
export type FailureClass = "tier-lock" | "live-offline" | "generic";

export function classifyFailure(
  kind: PlayerKind,
  duration: number,
  currentTime: number,
  errorMessage: string | undefined,
): FailureClass {
  if (kind !== "live" && duration === 0 && currentTime === 0) {
    return "tier-lock";
  }
  if (kind === "live" && errorMessage && /\b503\b/.test(errorMessage)) {
    return "live-offline";
  }
  return "generic";
}
