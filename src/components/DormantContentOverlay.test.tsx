/**
 * DormantContentOverlay tests — TDD RED phase.
 * Tests written before implementation exists.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DormantContentOverlay } from "./DormantContentOverlay";

// Stub norigin spatial navigation (not needed for overlay unit tests)
vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  useFocusable: () => ({
    ref: { current: null },
    focused: false,
    focusSelf: vi.fn(),
  }),
  setFocus: vi.fn(),
}));

describe("DormantContentOverlay", () => {
  it("renders the dormant-content message", () => {
    render(<DormantContentOverlay onDismiss={vi.fn()} />);
    expect(
      screen.getByText(/isn't on your current provider/i),
    ).toBeInTheDocument();
  });

  it("renders a dismiss button", () => {
    render(<DormantContentOverlay onDismiss={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /back to browse/i }),
    ).toBeInTheDocument();
  });

  it("calls onDismiss when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<DormantContentOverlay onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: /back to browse/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("has role=alertdialog for screen-reader accessibility", () => {
    render(<DormantContentOverlay onDismiss={vi.fn()} />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("shows the full spec copy about provider returning", () => {
    render(<DormantContentOverlay onDismiss={vi.fn()} />);
    expect(
      screen.getByText(/bring it back when the source returns/i),
    ).toBeInTheDocument();
  });
});
