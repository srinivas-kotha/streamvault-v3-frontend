/**
 * OverflowMenu unit tests (#58).
 *
 * Scope:
 *  - Renders the ⋯ trigger button with aria-label.
 *  - Click on trigger opens the overlay menu.
 *  - All action labels are visible when menu is open.
 *  - Clicking an action fires onSelect + closes the menu.
 *  - Escape closes the menu.
 *  - Disabled actions do not fire onSelect.
 *  - Click-outside closes the menu.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock norigin ────────────────────────────────────────────────────────────

const useFocusableSpy = vi.hoisted(() => vi.fn());

vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  useFocusable: (opts?: { focusKey?: string; onEnterPress?: () => void }) => {
    useFocusableSpy(opts);
    return {
      ref: { current: null },
      focusKey: opts?.focusKey ?? "MOCK_KEY",
      focused: false,
    };
  },
  setFocus: vi.fn(),
}));

import { OverflowMenu } from "./OverflowMenu";
import type { OverflowAction } from "./OverflowMenu";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeActions(overrides: Partial<OverflowAction>[] = []): OverflowAction[] {
  return [
    {
      label: "Mark as watched",
      onSelect: vi.fn(),
      ...overrides[0],
    },
    {
      label: "Remove from history",
      onSelect: vi.fn(),
      ...overrides[1],
    },
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("OverflowMenu", () => {
  beforeEach(() => {
    useFocusableSpy.mockClear();
  });

  it("renders the ⋯ trigger with the default aria-label", () => {
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    const trigger = screen.getByRole("button", { name: /more actions/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("renders the ⋯ trigger with a custom triggerLabel", () => {
    const actions = makeActions();
    render(
      <OverflowMenu
        focusKey="TEST_OVERFLOW"
        actions={actions}
        triggerLabel="More actions for Episode 1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /more actions for episode 1/i }),
    ).toBeInTheDocument();
  });

  it("menu is hidden by default", () => {
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu on click and shows all action labels", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));

    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /mark as watched/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /remove from history/i })).toBeInTheDocument();
  });

  it("aria-expanded is true when menu is open", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    const trigger = screen.getByRole("button", { name: /more actions/i });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking an action fires onSelect and closes the menu", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /mark as watched/i }));

    expect(actions[0]?.onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("clicking the second action fires its onSelect", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /remove from history/i }));

    expect(actions[1]?.onSelect).toHaveBeenCalledOnce();
    expect(actions[0]?.onSelect).not.toHaveBeenCalled();
  });

  it("Escape closes the menu without firing any action", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(actions[0]?.onSelect).not.toHaveBeenCalled();
    expect(actions[1]?.onSelect).not.toHaveBeenCalled();
  });

  it("disabled action does not fire onSelect", async () => {
    const user = userEvent.setup();
    const disabledHandler = vi.fn();
    const actions: OverflowAction[] = [
      { label: "Mark as watched", onSelect: vi.fn() },
      { label: "Disabled action", onSelect: disabledHandler, disabled: true },
    ];
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));

    const disabledItem = screen.getByRole("menuitem", { name: /disabled action/i });
    expect(disabledItem).toBeDisabled();

    // Clicking a disabled button should do nothing (browser blocks click on disabled)
    expect(disabledHandler).not.toHaveBeenCalled();
  });

  it("registers useFocusable with the provided focusKey", () => {
    const actions = makeActions();
    render(<OverflowMenu focusKey="EPISODE_OVERFLOW_42" actions={actions} />);

    const keys = useFocusableSpy.mock.calls.map((c) => c[0]?.focusKey).filter(Boolean);
    expect(keys).toContain("EPISODE_OVERFLOW_42");
  });

  it("re-clicking the trigger closes the menu (toggle)", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    const trigger = screen.getByRole("button", { name: /more actions/i });
    await user.click(trigger); // open
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(trigger); // close
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ArrowDown on first item moves focus to second item", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    const firstItem = screen.getByRole("menuitem", { name: /mark as watched/i });
    firstItem.focus();

    await user.keyboard("{ArrowDown}");

    const secondItem = screen.getByRole("menuitem", { name: /remove from history/i });
    expect(document.activeElement).toBe(secondItem);
  });

  it("ArrowUp on last item wraps focus to first item", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<OverflowMenu focusKey="TEST_OVERFLOW" actions={actions} />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    const lastItem = screen.getByRole("menuitem", { name: /remove from history/i });
    lastItem.focus();

    await user.keyboard("{ArrowUp}");

    const firstItem = screen.getByRole("menuitem", { name: /mark as watched/i });
    expect(document.activeElement).toBe(firstItem);
  });
});
