/**
 * cx() utility — TDD tests (Task 1.5)
 *
 * RED first: cx stub returns empty string. Tests must fail on assertions.
 * GREEN: implement cx() to join, dedupe, and drop falsy values.
 */
import { describe, it, expect } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("joins two truthy strings with a space", () => {
    expect(cx("foo", "bar")).toBe("foo bar");
  });

  it("drops null, undefined, and false", () => {
    expect(cx("foo", null, undefined, false, "bar")).toBe("foo bar");
  });

  it("deduplicates repeated tokens", () => {
    expect(cx("btn", "focus-ring", "btn")).toBe("btn focus-ring");
  });

  it("splits multi-token strings and deduplicates across them", () => {
    // "btn focus-ring" contains two tokens; "btn" is a dupe
    expect(cx("btn focus-ring", "btn")).toBe("btn focus-ring");
  });
});
