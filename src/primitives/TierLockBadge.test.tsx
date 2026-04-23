import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TierLockBadge } from "./TierLockBadge";

describe("TierLockBadge", () => {
  it("renders the lock glyph", () => {
    render(<TierLockBadge />);
    expect(screen.getByTestId("tier-lock-badge")).toHaveTextContent("🔒");
  });

  it("exposes a default accessible label", () => {
    render(<TierLockBadge />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Not available on your plan",
    );
  });

  it("applies a custom label when provided", () => {
    render(<TierLockBadge label="MP4 not in your Xtream plan" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "MP4 not in your Xtream plan",
    );
  });

  it("does not intercept pointer events (decoration, not control)", () => {
    render(<TierLockBadge />);
    const badge = screen.getByTestId("tier-lock-badge");
    expect(badge.style.pointerEvents).toBe("none");
  });
});
