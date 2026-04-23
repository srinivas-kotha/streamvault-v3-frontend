/**
 * usePlayerOpener — reusable hook for opening the player from any route.
 *
 * Used by LiveRoute, MoviesRoute, SeriesRoute, SearchRoute so they all share
 * the same open path. Fetches the stream URL for the given type/id, then
 * calls playerStore.open().
 *
 * Phase 6c: callers can pass onPrev/onNext callbacks to enable channel/
 * episode navigation inside the player. The route owns the list state and
 * re-calls openPlayer with updated indices; this hook is a thin pass-through.
 */
import { useCallback } from "react";
import { usePlayerStore, type PlayerKind } from "./PlayerProvider";
import { fetchStreamUrl } from "../api/stream";

interface OpenPlayerOptions {
  id: string;
  title: string;
  kind: PlayerKind;
  /** For series episodes: season + episode numbers */
  season?: number;
  episode?: number;
  /** In-player previous-sibling navigation (e.g. prev channel / prev episode) */
  onPrev?: () => void;
  /** In-player next-sibling navigation */
  onNext?: () => void;
}

export function usePlayerOpener() {
  const { open } = usePlayerStore();

  const openPlayer = useCallback(
    async (opts: OpenPlayerOptions) => {
      const { id, title, kind, season, episode, onPrev, onNext } = opts;

      // tsconfig has exactOptionalPropertyTypes:true — spread optional fields
      // only when defined so they aren't set to `undefined`.
      const streamUrl = fetchStreamUrl({
        kind,
        id,
        ...(season !== undefined && { season }),
        ...(episode !== undefined && { episode }),
      });

      open({
        src: streamUrl,
        title,
        kind,
        contentId: { kind, id },
        ...(onPrev && { onPrev }),
        ...(onNext && { onNext }),
      });
    },
    [open],
  );

  return { openPlayer };
}
