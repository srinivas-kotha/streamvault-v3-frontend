/**
 * Lightweight client telemetry.
 *
 * Ships events via console.info (always, so prod traces are inspectable in
 * Fire TV Silk devtools) and buffers the last 100 events on
 * `window.__svTelemetry` in DEV so Playwright + in-browser debugging can
 * assert on them.
 *
 * There is no server sink yet — when one lands, swap the console.info for
 * sendBeacon / fetch without touching callers.
 */
export type TelemetryEventName =
  | "back_pressed"
  | "nav_originator_restored"
  | "dock_navigated";

export interface TelemetryEventProps {
  [key: string]: string | number | boolean | null | undefined;
}

interface StoredEvent {
  name: TelemetryEventName;
  props: TelemetryEventProps;
  at: string;
}

const MAX_BUFFER = 100;

const buffer: StoredEvent[] = [];

function pushToBuffer(evt: StoredEvent): void {
  buffer.push(evt);
  if (buffer.length > MAX_BUFFER) {
    buffer.shift();
  }
}

function attachDevHandle(): void {
  if (typeof window === "undefined") return;
  try {
    if (!import.meta.env.DEV) return;
  } catch {
    // import.meta.env unavailable in some test contexts
    return;
  }
  (window as unknown as { __svTelemetry: StoredEvent[] }).__svTelemetry = buffer;
}

attachDevHandle();

export function logEvent(
  name: TelemetryEventName,
  props: TelemetryEventProps = {},
): void {
  const evt: StoredEvent = {
    name,
    props,
    at: new Date().toISOString(),
  };
  pushToBuffer(evt);
  console.info(`[telemetry] ${name}`, props);
}

/** Test-only: clear the in-memory buffer. */
export function __resetTelemetryForTest(): void {
  buffer.length = 0;
}

/** Test-only: read the current buffer. */
export function __getTelemetryBufferForTest(): ReadonlyArray<StoredEvent> {
  return buffer;
}
