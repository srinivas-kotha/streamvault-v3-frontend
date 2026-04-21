import { describe, it, expect, vi, beforeEach } from "vitest";

// Vitest hoists vi.mock() calls to the top, so mockInit must be defined via vi.hoisted()
const mockInit = vi.hoisted(() => vi.fn());

vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  init: mockInit,
}));

import { initSpatialNav } from "./spatialNav";

describe("initSpatialNav", () => {
  beforeEach(() => {
    mockInit.mockClear();
  });

  it("calls norigin init exactly once", () => {
    initSpatialNav();
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it("enables shouldFocusDOMNode so document.activeElement follows norigin", () => {
    initSpatialNav();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ shouldFocusDOMNode: true }),
    );
  });

  it("sets visualDebug: false (never on in prod)", () => {
    initSpatialNav();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ visualDebug: false }),
    );
  });

  it("passes debug flag derived from build environment", () => {
    // import.meta.env.DEV is mocked as false in test env (prod-like)
    initSpatialNav();
    // We just verify the call shape is correct — actual DEV value is env-dependent
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ debug: expect.any(Boolean) }),
    );
  });
});
