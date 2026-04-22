/**
 * LiveRoute — Live TV page (Task 4.4 full wiring)
 *
 * Responsibilities:
 *  - Fetch channels + categories on mount.
 *  - Own `selectedChannelId`, `sortBy`, `epgTimeFilter` state.
 *  - Derive the sorted channel list via `useSortedChannels`.
 *  - Render the sort + EPG-time toolbar ABOVE the channel list (Q3 — fewer
 *    D-pad hops). Each toolbar control uses `useFocusable` with a stable
 *    `focusKey` (D6a — Task 2.4 incident lesson).
 *  - Show <Skeleton> while loading, <ErrorShell> on fetch failure.
 *  - Retry callback re-fetches channels WITHOUT resetting `selectedChannelId`
 *    (Q1 — less jarring UX) and WITHOUT window.location.reload (TV-hostile).
 *  - Preserve the `CONTENT_AREA_LIVE` `useFocusable` + FocusContext wrapper
 *    (load-bearing for BottomDock's Esc-key routing — Task 2.4).
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import { SplitGuide } from "../features/live/SplitGuide";
import {
  useSortedChannels,
  type Category,
  type ChannelSortKey,
} from "../features/live/useSortedChannels";
import {
  EpgTimeFilter,
  type EpgTimeFilterValue,
} from "../features/live/EpgTimeFilter";
import { ErrorShell } from "../primitives/ErrorShell";
import { Skeleton } from "../primitives/Skeleton";
import { fetchChannels, fetchCategories } from "../api/live";
import type { Channel } from "../api/schemas";
import { usePlayerOpener } from "../player/usePlayerOpener";

// ─── Sort button (per-button norigin registration — D6a) ────────────────────

const SORT_OPTIONS: { id: ChannelSortKey; label: string }[] = [
  { id: "number", label: "Number" },
  { id: "name", label: "Name" },
  { id: "category", label: "Category" },
];

function SortButton({
  option,
  isActive,
  onSelect,
}: {
  option: { id: ChannelSortKey; label: string };
  isActive: boolean;
  onSelect: () => void;
}) {
  // D6a: `focusKey: SORT_<ID>` — norigin needs a stable handle per button
  // or ArrowLeft/Right across the toolbar gets pinned on one element.
  const { ref, focused } = useFocusable({
    focusKey: `SORT_${option.id.toUpperCase()}`,
    onEnterPress: onSelect,
  });
  const active = isActive || focused;

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      className="focus-ring"
      aria-pressed={isActive}
      onClick={onSelect}
      style={{
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: active ? "var(--accent-copper)" : "var(--bg-surface)",
        color: active ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-tracking)",
        textTransform: "uppercase",
        cursor: "pointer",
        transition:
          "background var(--motion-focus), color var(--motion-focus)",
      }}
    >
      {option.label}
    </button>
  );
}

// ─── LiveRoute ──────────────────────────────────────────────────────────────

export function LiveRoute() {
  // MUST PRESERVE: norigin root registration for the content area.
  // Dropping this breaks BottomDock's setFocus("CONTENT_AREA_LIVE") Esc flow
  // wired in Task 2.4.
  const { ref, focusKey } = useFocusable({ focusKey: "CONTENT_AREA_LIVE" });
  const { openPlayer } = usePlayerOpener();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [sortBy, setSortBy] = useState<ChannelSortKey>("number");
  const [epgTimeFilter, setEpgTimeFilter] = useState<EpgTimeFilterValue>(
    "all",
  );

  const sorted = useSortedChannels(channels, sortBy, categories);

  // When user presses Enter on an already-selected channel (or a channel is
  // clicked for play), open the player. First Enter selects; second Enter plays.
  const handlePlayChannel = useCallback(
    (id: string) => {
      const channel = channels.find((c) => c.id === id);
      if (!channel) return;
      void openPlayer({
        id: channel.id,
        title: channel.name,
        kind: "live",
      });
    },
    [channels, openPlayer],
  );

  const handleSelectOrPlay = useCallback(
    (id: string) => {
      if (id === selectedChannelId) {
        // Already selected → play
        handlePlayChannel(id);
      } else {
        // First press → select
        setSelectedChannelId(id);
      }
    },
    [selectedChannelId, handlePlayChannel],
  );

  // Initial fetch — channels + categories in parallel. We seed
  // `selectedChannelId` from the first channel on first load only; retries
  // explicitly PRESERVE the prior selection (Q1).
  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchChannels(), fetchCategories().catch(() => [])])
      .then(([chs, cats]) => {
        if (cancelled) return;
        setChannels(chs);
        setCategories(cats);
        setSelectedChannelId(chs[0]?.id ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Q1: Retry re-fetches channels WITHOUT resetting selectedChannelId. If the
  // user was mid-browse when the network blipped, their cursor stays put.
  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);
    Promise.all([fetchChannels(), fetchCategories().catch(() => [])])
      .then(([chs, cats]) => {
        setChannels(chs);
        setCategories(cats);
        // Intentional: DO NOT overwrite selectedChannelId here. If the
        // previously-selected channel is still present, it stays selected.
        // If it's gone, SplitGuide falls back to "No channel selected".
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref as RefObject<HTMLElement>}
        data-page="live"
        tabIndex={-1}
        style={{
          paddingBottom:
            "calc(var(--dock-height) + var(--space-6) + var(--space-6))",
          // Chromatic ambient fill — softly lit console atmosphere
          backgroundImage: "var(--hero-ambient)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 320px",
          backgroundPosition: "top center",
        }}
      >
        {loading ? (
          <div
            style={{
              padding: "var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <Skeleton width="100%" height={48} />
            <Skeleton width="100%" height={400} />
          </div>
        ) : error ? (
          <ErrorShell
            icon="network"
            title="Can't load channels"
            subtext="Check your connection and try again."
            onRetry={handleRetry}
          />
        ) : (
          <>
            {/* Toolbar — lives ABOVE the channel list (Q3) so D-pad reaches
                it in one ArrowUp from the list. UX designer: flag for
                final visual polish review (colours, spacing, active state). */}
            <div
              role="toolbar"
              aria-label="Channel sort and EPG filter"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "var(--space-4)",
                padding: "var(--space-4) var(--space-6)",
                borderBottom: "1px solid var(--bg-surface)",
              }}
            >
              <div
                role="group"
                aria-label="Sort channels"
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-label-size)",
                    color: "var(--text-secondary)",
                    letterSpacing: "var(--text-label-tracking)",
                    textTransform: "uppercase",
                  }}
                >
                  Sort
                </span>
                {SORT_OPTIONS.map((opt) => (
                  <SortButton
                    key={opt.id}
                    option={opt}
                    isActive={sortBy === opt.id}
                    onSelect={() => setSortBy(opt.id)}
                  />
                ))}
              </div>

              <EpgTimeFilter
                value={epgTimeFilter}
                onChange={setEpgTimeFilter}
              />
            </div>

            <SplitGuide
              channels={sorted}
              selectedChannelId={selectedChannelId}
              onSelectChannel={handleSelectOrPlay}
              onRetry={handleRetry}
            />
          </>
        )}
      </main>
    </FocusContext.Provider>
  );
}
