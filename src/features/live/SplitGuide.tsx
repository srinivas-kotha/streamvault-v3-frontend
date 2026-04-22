/**
 * SplitGuide — Live TV channel list + preview pane (Task 4.3)
 *
 * Purely presentational 55/45 split layout consumed by LiveRoute.
 *  - Left pane: static poster placeholder + selected channel name + optional
 *    EPG "Now" / "Next" titles.
 *  - Right pane: scrollable channel list. Each row uses `useFocusable` with
 *    `focusKey: CHANNEL_<id>` so norigin can build a spatial graph and
 *    D-pad Up/Down traverses the list on Fire TV. (Lesson from Task 2.4:
 *    unregistered rows are unreachable on the remote.)
 *
 * Empty / error state: channels.length === 0 → <ErrorShell> with
 * parent-provided onRetry callback. We deliberately do NOT call
 * window.location.reload() — that causes a multi-second blank screen and
 * re-initialises norigin on Fire TV Silk.
 *
 * Loading state: when `loading` is true the panes render <Skeleton>
 * placeholders. Parent (LiveRoute) toggles this during initial fetch so
 * the user never sees the empty-state alert mid-flight.
 *
 * No HLS preview in Phase 4 — live stream lands in Phase 5a (M3 decision).
 */
import type { RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { ErrorShell } from "../../primitives/ErrorShell";
import { Skeleton } from "../../primitives/Skeleton";
import type { Channel } from "../../api/schemas";

export interface SplitGuideProps {
  /** Channel list from fetchChannels() (parent-owned). */
  channels: Channel[];
  /** Currently-selected channel id (parent-owned useState). */
  selectedChannelId: string | null;
  /** Fired when a channel row is clicked or Enter-pressed on remote. */
  onSelectChannel: (id: string) => void;
  /** Title of the EPG entry currently airing on the selected channel. */
  epgCurrentTitle?: string;
  /** Title of the next EPG entry on the selected channel. */
  epgNextTitle?: string;
  /** Parent re-fetches channels when user clicks Retry on the empty state. */
  onRetry?: () => void;
  /** When true, render Skeleton placeholders instead of ErrorShell/list. */
  loading?: boolean;
}

export function SplitGuide({
  channels,
  selectedChannelId,
  onSelectChannel,
  epgCurrentTitle,
  epgNextTitle,
  onRetry,
  loading = false,
}: SplitGuideProps) {
  // ─── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={splitGridStyle}>
        <section
          aria-label="Channel preview"
          style={previewPaneStyle}
          aria-busy="true"
        >
          <Skeleton width="100%" height="60%" />
          <Skeleton width="60%" height="var(--space-6)" />
        </section>
        <div style={listPaneStyle} aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              width="100%"
              height="var(--space-10)"
              className="split-guide__row-skeleton"
            />
          ))}
        </div>
      </div>
    );
  }

  // ─── Empty / error state ───────────────────────────────────────────────
  if (channels.length === 0) {
    return (
      <ErrorShell
        icon="network"
        title="Can't load channels"
        subtext="We couldn't reach the live TV service."
        onRetry={onRetry ?? (() => {})}
      />
    );
  }

  // ─── Happy path ────────────────────────────────────────────────────────
  const selected =
    channels.find((c) => c.id === selectedChannelId) ?? null;

  return (
    <div style={splitGridStyle}>
      {/* ── Left pane: preview ── */}
      <section aria-label="Channel preview" style={previewPaneStyle}>
        <div
          aria-label="Video preview"
          style={posterStyle}
        >
          <span style={posterLabelStyle}>
            {selected ? selected.name : "No channel selected"}
          </span>
        </div>
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <p style={previewTitleStyle}>{selected.name}</p>
            {epgCurrentTitle !== undefined && (
              <p style={epgLineStyle}>
                <strong>Now:</strong> {epgCurrentTitle}
              </p>
            )}
            {epgNextTitle !== undefined && (
              <p style={epgLineStyle}>
                <strong>Next:</strong> {epgNextTitle}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Right pane: channel list ── */}
      <ul aria-label="Channel list" style={listPaneStyle}>
        {channels.map((channel, index) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            index={index}
            isSelected={channel.id === selectedChannelId}
            onSelect={onSelectChannel}
          />
        ))}
      </ul>
    </div>
  );
}

// ─── ChannelRow ─────────────────────────────────────────────────────────────
// Split out so `useFocusable` runs per-row with a stable focusKey. Without
// per-row registration, norigin can't locate siblings under CONTENT_AREA_LIVE
// and ArrowUp/Down on the remote would stay pinned on the first row.

function ChannelRow({
  channel,
  index,
  isSelected,
  onSelect,
}: {
  channel: Channel;
  index: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const { ref, focused } = useFocusable({
    focusKey: `CHANNEL_${channel.id}`,
    onEnterPress: () => onSelect(channel.id),
  });
  const active = isSelected || focused;
  // Backend catalog items don't carry a channel number; fall back to 1-based
  // array index so the left-gutter digit + aria-label stay human-readable.
  const displayNum = channel.num ?? index + 1;

  return (
    <li style={{ listStyle: "none" }}>
      <button
        ref={ref as RefObject<HTMLButtonElement>}
        type="button"
        className="focus-ring"
        onClick={() => onSelect(channel.id)}
        aria-label={`Channel ${displayNum}: ${channel.name}`}
        aria-current={isSelected ? "true" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          width: "100%",
          padding: "var(--space-3) var(--space-4)",
          background: active
            ? "var(--accent-copper)"
            : "var(--bg-surface)",
          color: active ? "var(--bg-base)" : "var(--text-primary)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          fontSize: "var(--text-body-size)",
          textAlign: "left",
          transition:
            "background var(--motion-focus), color var(--motion-focus)",
        }}
      >
        <span
          style={{
            minWidth: "48px",
            fontVariantNumeric: "tabular-nums",
            opacity: 0.8,
          }}
        >
          {displayNum}
        </span>
        <span style={{ flex: 1 }}>{channel.name}</span>
        {isSelected && (
          <span
            aria-hidden="true"
            style={{ fontSize: "var(--text-label-size)", fontWeight: 600 }}
          >
            ● LIVE
          </span>
        )}
      </button>
    </li>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const splitGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "55fr 45fr",
  gap: "var(--space-6)",
  padding: "var(--space-6)",
  height:
    "calc(100vh - var(--dock-height) - var(--space-12))",
  boxSizing: "border-box",
};

const previewPaneStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
  padding: "var(--space-4)",
  background: "var(--bg-surface)",
  borderRadius: "var(--radius-md)",
  minHeight: 0,
};

const posterStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-secondary)",
  minHeight: "160px",
};

const posterLabelStyle: React.CSSProperties = {
  fontSize: "var(--text-title-size)",
  fontWeight: 600,
};

const previewTitleStyle: React.CSSProperties = {
  fontSize: "var(--text-title-size)",
  color: "var(--text-primary)",
  margin: 0,
};

const epgLineStyle: React.CSSProperties = {
  fontSize: "var(--text-body-size)",
  color: "var(--text-secondary)",
  margin: 0,
};

const listPaneStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: 0,
  margin: 0,
  overflowY: "auto",
  listStyle: "none",
};
