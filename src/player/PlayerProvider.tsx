/**
 * PlayerProvider — global player state (React context + reducer).
 *
 * Single instance wrapping AppShell. PlayerShell renders only when status
 * is not "idle" — ensures only one <video> ever mounts (CRITICAL: no double
 * mount). No Zustand; no extra deps.
 *
 * Back-button handling: when the player is open, the browser history listener
 * intercepts popstate and closes the player instead of navigating away.
 * This matches Fire TV remote back-button semantics.
 */
import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export type PlayerKind = "live" | "vod" | "series-episode";

export interface PlayerOpenPayload {
  src: string;
  title: string;
  kind?: PlayerKind;
}

interface PlayerStateOpen {
  status: "open";
  src: string;
  title: string;
  kind: PlayerKind;
}

interface PlayerStateIdle {
  status: "idle";
}

export type PlayerState = PlayerStateIdle | PlayerStateOpen;

type PlayerAction =
  | { type: "OPEN"; payload: PlayerOpenPayload }
  | { type: "CLOSE" };

function playerReducer(_state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "OPEN":
      return {
        status: "open",
        src: action.payload.src,
        title: action.payload.title,
        kind: action.payload.kind ?? "vod",
      };
    case "CLOSE":
      return { status: "idle" };
    default:
      return _state;
  }
}

interface PlayerContextValue {
  state: PlayerState;
  open: (payload: PlayerOpenPayload) => void;
  close: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, { status: "idle" });

  const open = useCallback((payload: PlayerOpenPayload) => {
    dispatch({ type: "OPEN", payload });
  }, []);

  const close = useCallback(() => {
    dispatch({ type: "CLOSE" });
  }, []);

  // Back-button handling: when player is open, intercept popstate (Fire TV
  // back button) and close player instead of navigating away.
  useEffect(() => {
    if (state.status !== "open") return;

    // Push a sentinel entry so there is a state to pop back to.
    window.history.pushState({ playerOpen: true }, "");

    const handlePopState = (e: PopStateEvent) => {
      // If the state we're popping to is NOT our sentinel, close the player.
      if (e.state?.playerOpen !== true) {
        close();
      } else {
        // We're at the sentinel — close player and remove it.
        close();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [state.status, close]);

  return (
    <PlayerContext.Provider value={{ state, open, close }}>
      {children}
    </PlayerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayerStore(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayerStore must be used within <PlayerProvider>");
  }
  return ctx;
}
