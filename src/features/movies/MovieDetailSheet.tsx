/**
 * MovieDetailSheet — bottom-sheet detail view for a focused movie.
 *
 * Spec: docs/ux/03-movies.md §7.
 *
 * Mount contract: the parent mounts this component *only* when a detail
 * sheet should be showing, keyed by the stream id. That way each "open" is
 * a fresh mount — no need to reset state in an effect when the selected
 * stream changes, and no `open` prop. Close path: parent sets `sheetStream`
 * to null and the component unmounts.
 *
 * D-pad: PLAY auto-focused. Right walks PLAY → Favorite → Mark watched
 * (no wrap). Up from PLAY → Close. Down from Close → PLAY. Back / Escape
 * closes the sheet (capture-phase so the route's global back handler does
 * not fire on the same key event).
 *
 * Focus return: `setFocus(\`VOD_CARD_${stream.id}\`)` fires on unmount so
 * the originating card re-takes focus.
 */
import type { RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  useFocusable,
  setFocus,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import {
  addFavorite,
  removeFavorite,
  isFavorited,
} from "../../api/favorites";
import { recordHistory } from "../../api/history";
import { fetchVodInfo } from "../../api/vod";
import type { VodInfo, VodStream } from "../../api/schemas";

export interface MovieDetailSheetProps {
  stream: VodStream;
  onClose: () => void;
  onPlay: (stream: VodStream) => void;
}

interface SheetButtonProps {
  focusKey: string;
  label: string;
  onSelect: () => void;
  shouldAutoFocus?: boolean;
  variant?: "primary" | "secondary";
}

function SheetButton({
  focusKey,
  label,
  onSelect,
  shouldAutoFocus = false,
  variant = "secondary",
}: SheetButtonProps) {
  const { ref, focused, focusSelf } = useFocusable<HTMLButtonElement>({
    focusKey,
    onEnterPress: onSelect,
  });

  useEffect(() => {
    if (shouldAutoFocus) focusSelf();
    // focusSelf identity churns across renders; intentionally omit from
    // deps so we only self-focus on the first mount when requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoFocus]);

  const primary = variant === "primary";
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      onClick={onSelect}
      className="focus-ring"
      style={{
        padding: "var(--space-3) var(--space-6)",
        borderRadius: "var(--radius-pill)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : primary
            ? "2px solid var(--accent-copper)"
            : "2px solid rgba(200, 121, 65, 0.3)",
        background: focused
          ? "var(--accent-copper)"
          : primary
            ? "var(--accent-copper)"
            : "rgba(200, 121, 65, 0.12)",
        color: focused || primary ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-body-size)",
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      {label}
    </button>
  );
}

export function MovieDetailSheet({
  stream,
  onClose,
  onPlay,
}: MovieDetailSheetProps) {
  const { ref: sheetRef, focusKey } = useFocusable({
    focusKey: "MOVIE_DETAIL_SHEET",
    focusable: false,
    trackChildren: true,
  });

  // Lazy init reads localStorage once on mount — stream is stable for the
  // lifetime of this component (parent remounts per stream id).
  const [favorited, setFavorited] = useState<boolean>(() =>
    isFavorited(Number(stream.id), "vod"),
  );
  const [info, setInfo] = useState<VodInfo | null>(null);
  const [infoError, setInfoError] = useState<boolean>(false);

  // Detail fetch: degrades gracefully on failure. setState calls in .then
  // / .catch are async, not synchronous-in-effect, and settle the derived
  // UI state for the mount lifetime.
  useEffect(() => {
    let cancelled = false;
    fetchVodInfo(stream.id)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) setInfoError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [stream.id]);

  // Capture-phase Back/Escape so the route's global handler doesn't also fire.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [onClose]);

  // Focus return on unmount — route the cursor back to the originating card.
  useEffect(() => {
    const originatingId = stream.id;
    return () => {
      setTimeout(() => setFocus(`VOD_CARD_${originatingId}`), 0);
    };
  }, [stream.id]);

  const meta = useMemo(() => {
    const year = info?.year ?? stream.year;
    // `duration` is a display string from Xtream ("2h 15min"); use it verbatim
    // when present, otherwise derive from the numeric durationSecs.
    const durationLabel =
      info?.duration ||
      (info?.durationSecs && info.durationSecs > 0
        ? `${Math.round(info.durationSecs / 60)} min`
        : undefined);
    const rating = info?.rating ?? stream.rating;
    const genre = info?.genre ?? stream.genre;
    return [year, durationLabel, rating ? `★ ${rating}` : undefined, genre]
      .filter(Boolean)
      .join(" · ");
  }, [info, stream]);

  const plot = info?.plot;
  const icon = info?.icon ?? stream.icon;

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={sheetRef as RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-sheet-title"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: "60vh",
          background: "var(--bg-elevated, rgba(24, 20, 18, 0.97))",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(200, 121, 65, 0.25)",
          boxShadow: "0 -16px 48px rgba(0, 0, 0, 0.6)",
          zIndex: 150,
          display: "flex",
          flexDirection: "column",
          padding: "var(--space-8) var(--space-10)",
          gap: "var(--space-6)",
          animation: "movie-sheet-in 240ms ease-out",
        }}
      >
        <style>{`
          @keyframes movie-sheet-in {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            [role="dialog"][aria-modal="true"] {
              animation-duration: 0ms !important;
            }
          }
        `}</style>

        <div
          style={{
            position: "absolute",
            top: "var(--space-4)",
            right: "var(--space-6)",
          }}
        >
          <SheetButton
            focusKey="MOVIE_SHEET_CLOSE"
            label="Close"
            onSelect={onClose}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: "var(--space-8)",
            flex: 1,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: "18vw",
              maxWidth: 240,
              aspectRatio: "2 / 3",
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            {icon ? (
              <img
                src={icon}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : null}
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
              minWidth: 0,
            }}
          >
            <h2
              id="movie-sheet-title"
              style={{
                margin: 0,
                fontSize: "var(--type-title, 32px)",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {stream.name}
            </h2>
            {meta ? (
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "var(--text-body-size)",
                }}
              >
                {meta}
              </div>
            ) : null}
            <p
              style={{
                margin: 0,
                marginTop: "var(--space-2)",
                color: "var(--text-primary)",
                fontSize: "var(--text-body-size)",
                lineHeight: 1.6,
                overflow: "auto",
                flex: 1,
              }}
            >
              {plot ??
                (infoError
                  ? "More details aren't available for this title."
                  : "Loading…")}
            </p>
            {info?.cast ? (
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "var(--text-caption-size)",
                }}
              >
                Cast: {info.cast}
              </div>
            ) : null}
            {info?.director ? (
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "var(--text-caption-size)",
                }}
              >
                Director: {info.director}
              </div>
            ) : null}
          </div>
        </div>

        <div
          role="group"
          aria-label="Actions"
          style={{
            display: "flex",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          <SheetButton
            focusKey="MOVIE_SHEET_PLAY"
            label="▶ Play"
            variant="primary"
            shouldAutoFocus
            onSelect={() => {
              onPlay(stream);
              onClose();
            }}
          />
          <SheetButton
            focusKey="MOVIE_SHEET_FAVORITE"
            label={favorited ? "✕ Remove from favorites" : "☆ Favorite"}
            onSelect={() => {
              if (favorited) {
                void removeFavorite(Number(stream.id), "vod");
                setFavorited(false);
              } else {
                void addFavorite(Number(stream.id), {
                  content_type: "vod",
                  content_name: stream.name,
                  ...(stream.icon ? { content_icon: stream.icon } : {}),
                });
                setFavorited(true);
              }
            }}
          />
          <SheetButton
            focusKey="MOVIE_SHEET_MARK_WATCHED"
            label="✓ Mark watched"
            onSelect={() => {
              void recordHistory(Number(stream.id), {
                content_type: "vod",
                content_name: stream.name,
                ...(stream.icon ? { content_icon: stream.icon } : {}),
                progress_seconds: 1,
                duration_seconds: 1,
              });
            }}
          />
        </div>
      </div>
    </FocusContext.Provider>
  );
}
