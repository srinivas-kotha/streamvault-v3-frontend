/**
 * LanguageRail — renders 4 chips by default, 5 with Sports, and an extra
 * leading Continue-watching chip when the `continueWatching` prop is set.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  useFocusable: () => ({ ref: { current: null }, focused: false }),
  FocusContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  setFocus: vi.fn(),
}));

import { LanguageRail } from "./LanguageRail";

describe("LanguageRail", () => {
  it("renders 4 chips by default (Telugu / Hindi / English / All)", () => {
    render(<LanguageRail value="telugu" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Telugu" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Hindi" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Sports" })).toBeNull();
  });

  it("renders 5 chips when showSports is true", () => {
    render(
      <LanguageRail value="telugu" onChange={vi.fn()} showSports={true} />,
    );
    expect(screen.getByRole("radio", { name: "Sports" })).toBeInTheDocument();
  });

  it("marks the active chip via aria-checked", () => {
    render(<LanguageRail value="hindi" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Hindi" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Telugu" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("calls onChange with the chip id when selected", async () => {
    const onChange = vi.fn();
    render(<LanguageRail value="telugu" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(onChange).toHaveBeenCalledWith("english");
  });

  it("renders a leading Continue-watching chip when continueWatching is set", async () => {
    const onSelect = vi.fn();
    render(
      <LanguageRail
        value="telugu"
        onChange={vi.fn()}
        continueWatching={{ onSelect }}
      />,
    );
    const chip = screen.getByRole("button", { name: "Continue watching" });
    expect(chip).toBeInTheDocument();
    await userEvent.click(chip);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("omits the Continue-watching chip when prop is null/undefined", () => {
    render(
      <LanguageRail
        value="telugu"
        onChange={vi.fn()}
        continueWatching={null}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Continue watching" }),
    ).toBeNull();
  });
});
