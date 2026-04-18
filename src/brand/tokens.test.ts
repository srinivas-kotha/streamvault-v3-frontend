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
