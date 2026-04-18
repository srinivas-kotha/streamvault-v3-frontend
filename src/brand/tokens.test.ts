// Note: these tests verify the TS OXIDE constants only.
// jsdom (Vitest's default environment) does not parse imported CSS,
// so getComputedStyle cannot observe tokens.css var values at unit-test level.
// The CSS contract is enforced at E2E by Task 1.7's axe-core color-contrast
// gate running against the real browser. Keep OXIDE and tokens.css in lockstep
// by convention — any hex change MUST be applied in both files.
import { describe, it, expect } from "vitest";
import { OXIDE } from "./index";

describe("Oxide tokens", () => {
  it("exports --bg-base as #12100E", () => {
    expect(OXIDE.bgBase).toBe("#12100E");
  });
  it("exports --accent-copper as #C87941", () => {
    expect(OXIDE.accentCopper).toBe("#C87941");
  });
  it("exports --text-primary as #EDE4D3", () => {
    expect(OXIDE.textPrimary).toBe("#EDE4D3");
  });
  it("exports spacing base of 8", () => {
    expect(OXIDE.spacingBase).toBe(8);
  });
});
