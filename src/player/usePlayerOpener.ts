/**
 * usePlayerOpener — reusable hook for opening the player from any route.
 *
 * Used by LiveRoute, MoviesRoute, SeriesRoute, SearchRoute so they all share
 * the same open path. Fetches the stream URL for the given type/id, then
 * calls playerStore.open().
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
}

export function usePlayerOpener() {
  const { open } = usePlayerStore();

  const openPlayer = useCallback(
    async (opts: OpenPlayerOptions) => {
      const { id, title, kind, season, episode } = opts;

      // tsconfig has exactOptionalPropertyTypes:true — spread season/episode
      // only when defined so the optional field isn't set to `undefined`.
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
      });
    },
    [open],
  );

  return { openPlayer };
}
