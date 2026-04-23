import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  logEvent,
  __resetTelemetryForTest,
  __getTelemetryBufferForTest,
} from "./index";

describe("telemetry", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetTelemetryForTest();
    consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("pushes events into the ring buffer with name + props + timestamp", () => {
    logEvent("back_pressed", { route: "/series/42", depth: 2, handled_by: "detail_route_pop" });
    const buf = __getTelemetryBufferForTest();
    expect(buf).toHaveLength(1);
    expect(buf[0]!.name).toBe("back_pressed");
    expect(buf[0]!.props).toEqual({
      route: "/series/42",
      depth: 2,
      handled_by: "detail_route_pop",
    });
    expect(buf[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("logs via console.info for live inspection", () => {
    logEvent("dock_navigated", { to: "movies" });
    expect(consoleSpy).toHaveBeenCalledWith("[telemetry] dock_navigated", {
      to: "movies",
    });
  });

  it("truncates the buffer to its cap (drops oldest)", () => {
    // Cap is 100; push 105 and assert only last 100 remain.
    for (let i = 0; i < 105; i += 1) {
      logEvent("back_pressed", { i });
    }
    const buf = __getTelemetryBufferForTest();
    expect(buf).toHaveLength(100);
    expect(buf[0]!.props.i).toBe(5); // first 5 dropped
    expect(buf[99]!.props.i).toBe(104);
  });

  it("accepts empty props", () => {
    logEvent("back_pressed");
    const buf = __getTelemetryBufferForTest();
    expect(buf[0]!.props).toEqual({});
  });
});
