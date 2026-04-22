/**
 * SettingsRoute.test.tsx — all sections render, logout wired, form
 * validation, preferences persist, clear-history wired.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  useFocusable: (opts?: { focusKey?: string; onEnterPress?: () => void }) => ({
    ref: { current: null },
    focusKey: opts?.focusKey ?? "MOCK_KEY",
    focused: false,
  }),
  FocusContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  setFocus: vi.fn(),
}));

const logoutMock = vi.hoisted(() => vi.fn());
const changePasswordMock = vi.hoisted(() => vi.fn());
vi.mock("../api/auth", () => ({
  logout: logoutMock,
  changePassword: changePasswordMock,
}));

// Stub location.href assignment
const hrefSetter = vi.fn();
Object.defineProperty(window, "location", {
  value: { ...window.location, set href(v: string) { hrefSetter(v); } },
  writable: true,
});

import { SettingsRoute } from "./SettingsRoute";

function renderSettings(username = "testuser") {
  sessionStorage.setItem("sv_access_token", username);
  render(<SettingsRoute />);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

// ─── Section rendering ───────────────────────────────────────────────────────

describe("SettingsRoute sections", () => {
  it("renders Account section heading", () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: /account/i })).toBeInTheDocument();
  });

  it("shows username from session", () => {
    renderSettings("alice");
    expect(screen.getByTestId("account-username")).toHaveTextContent("alice");
  });

  it("renders Playback Preferences section", () => {
    renderSettings();
    expect(
      screen.getByRole("heading", { name: /playback preferences/i }),
    ).toBeInTheDocument();
  });

  it("renders App Info section", () => {
    renderSettings();
    expect(
      screen.getByRole("heading", { name: /app info/i }),
    ).toBeInTheDocument();
  });

  it("renders Danger Zone section", () => {
    renderSettings();
    expect(
      screen.getByRole("heading", { name: /danger zone/i }),
    ).toBeInTheDocument();
  });

  it("renders Change Password button", () => {
    renderSettings();
    expect(screen.getByTestId("btn-change-password")).toBeInTheDocument();
  });

  it("renders Sign Out button", () => {
    renderSettings();
    expect(screen.getByTestId("btn-logout")).toBeInTheDocument();
  });

  it("renders Clear History button", () => {
    renderSettings();
    expect(screen.getByTestId("btn-clear-history")).toBeInTheDocument();
  });

  it("renders Clear Favorites button", () => {
    renderSettings();
    expect(screen.getByTestId("btn-clear-favorites")).toBeInTheDocument();
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

describe("Logout", () => {
  it("calls logout() and redirects on Sign Out click", async () => {
    logoutMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByTestId("btn-logout"));

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
    });
    expect(hrefSetter).toHaveBeenCalledWith("/");
  });
});

// ─── Change-password form ─────────────────────────────────────────────────────

describe("Change Password form", () => {
  it("shows inline form after clicking Change Password", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByTestId("btn-change-password"));

    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText("New Password", { exact: true }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it("shows validation error for too-short password", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByTestId("btn-change-password"));
    await user.type(screen.getByLabelText(/current password/i), "oldpw");
    await user.type(
      screen.getByLabelText("New Password", { exact: true }),
      "short",
    );
    await user.type(screen.getByLabelText(/confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText(/at least 12 characters/i),
    ).toBeInTheDocument();
  });
});

// ─── Preferences persist ─────────────────────────────────────────────────────

describe("Preferences localStorage persistence", () => {
  it("saves subtitle pref to localStorage when chip clicked", async () => {
    const user = userEvent.setup();
    renderSettings();

    // Hindi appears in both subtitle and audio rows — first is subtitle
    const chips = screen.getAllByRole("button", { name: /hindi/i });
    // First Hindi chip is subtitle, second is audio
    await user.click(chips[0]);

    expect(localStorage.getItem("sv_pref_subtitle")).toBe("hi");
  });

  it("saves quality pref to localStorage when chip clicked", async () => {
    const user = userEvent.setup();
    renderSettings();

    // 720p chip
    const chip720 = screen.getByRole("button", { name: /720p/i });
    await user.click(chip720);

    expect(localStorage.getItem("sv_pref_quality")).toBe("720p");
  });
});

// ─── Danger zone ─────────────────────────────────────────────────────────────

describe("Danger zone", () => {
  it("clears sv_hist* keys from localStorage on Clear History click", async () => {
    localStorage.setItem("sv_hist_c1", "watched");
    localStorage.setItem("sv_hist_c2", "watched");
    localStorage.setItem("sv_fav_m1", "liked");

    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByTestId("btn-clear-history"));

    await waitFor(() => {
      expect(localStorage.getItem("sv_hist_c1")).toBeNull();
      expect(localStorage.getItem("sv_hist_c2")).toBeNull();
      // favorites untouched
      expect(localStorage.getItem("sv_fav_m1")).toBe("liked");
    });
  });

  it("clears sv_fav* keys on Clear Favorites click", async () => {
    localStorage.setItem("sv_fav_m1", "liked");
    localStorage.setItem("sv_fav_m2", "liked");

    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByTestId("btn-clear-favorites"));

    await waitFor(() => {
      expect(localStorage.getItem("sv_fav_m1")).toBeNull();
      expect(localStorage.getItem("sv_fav_m2")).toBeNull();
    });
  });
});
