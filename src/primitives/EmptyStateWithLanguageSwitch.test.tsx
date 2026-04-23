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

import { EmptyStateWithLanguageSwitch } from "./EmptyStateWithLanguageSwitch";

describe("EmptyStateWithLanguageSwitch", () => {
  it("renders the headline + message", () => {
    render(
      <EmptyStateWithLanguageSwitch
        currentLang="telugu"
        onSwitch={vi.fn()}
        headline="No Telugu movies"
        message="Try another language."
      />,
    );
    expect(screen.getByText("No Telugu movies")).toBeInTheDocument();
    expect(screen.getByText("Try another language.")).toBeInTheDocument();
  });

  it("omits the current language from suggestions", () => {
    render(
      <EmptyStateWithLanguageSwitch currentLang="hindi" onSwitch={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /Try Hindi/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try English/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show All/i })).toBeInTheDocument();
  });

  it("calls onSwitch with the selected language", async () => {
    const onSwitch = vi.fn();
    render(
      <EmptyStateWithLanguageSwitch currentLang="telugu" onSwitch={onSwitch} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Try English/i }),
    );
    expect(onSwitch).toHaveBeenCalledWith("english");
  });

  it("accepts a custom suggestion list", () => {
    render(
      <EmptyStateWithLanguageSwitch
        currentLang="telugu"
        onSwitch={vi.fn()}
        suggestions={["sports", "all"]}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Try Sports/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Try Hindi/i }),
    ).not.toBeInTheDocument();
  });
});
