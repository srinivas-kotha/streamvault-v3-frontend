import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const useFocusableSpy = vi.hoisted(() => vi.fn());
const setFocusSpy = vi.hoisted(() => vi.fn());
vi.mock("@noriginmedia/norigin-spatial-navigation", () => ({
  init: vi.fn(),
  useFocusable: (opts?: {
    focusable?: boolean;
    focusKey?: string;
    onEnterPress?: () => void;
  }) => {
    useFocusableSpy(opts);
    return {
      ref: { current: null },
      focusKey: opts?.focusKey ?? "MOCK_KEY",
      focused: false,
      focusSelf: vi.fn(),
    };
  },
  FocusContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  setFocus: setFocusSpy,
}));

import { LoginPage } from "./LoginPage";
import * as authApi from "../../api/auth";
import { apiClient } from "../../api/client";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useFocusableSpy.mockClear();
    setFocusSpy.mockClear();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders form with username and password inputs", () => {
    render(<LoginPage onLoginSuccess={() => {}} />);
    expect(screen.getByLabelText("Username")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
  });

  it("calls onLoginSuccess on valid cookie-based login", async () => {
    vi.spyOn(authApi, "login").mockImplementation(async (username) => {
      apiClient.setSession(username);
      return { message: "Login successful", userId: 1, username };
    });
    const onSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(apiClient.hasSession()).toBe(true);
  });

  it("shows role=alert on login failure", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new Error("401"));
    render(<LoginPage onLoginSuccess={() => {}} />);
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "bad" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/invalid/i);
    });
    expect(apiClient.hasSession()).toBe(false);
  });

  // ─── 2026-04-22 norigin retrofit ─────────────────────────────────────────

  it("registers LOGIN_USERNAME + LOGIN_PASSWORD + LOGIN_SUBMIT focus keys", () => {
    render(<LoginPage onLoginSuccess={() => {}} />);
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusKey?: string }]
    >;
    const keys = calls.map((c) => c[0]?.focusKey).filter(Boolean);
    expect(keys).toEqual(
      expect.arrayContaining([
        "LOGIN_USERNAME",
        "LOGIN_PASSWORD",
        "LOGIN_SUBMIT",
      ]),
    );
  });

  it("primes norigin to focus LOGIN_USERNAME on mount", () => {
    render(<LoginPage onLoginSuccess={() => {}} />);
    expect(setFocusSpy).toHaveBeenCalledWith("LOGIN_USERNAME");
  });

  it("re-focuses LOGIN_USERNAME on login failure (so user can retry)", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new Error("401"));
    render(<LoginPage onLoginSuccess={() => {}} />);
    setFocusSpy.mockClear();
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "bad" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(setFocusSpy).toHaveBeenCalledWith("LOGIN_USERNAME");
    });
  });

  // ─── norigin preventDefaults Enter, so onEnterPress must be wired on
  //     every TV-reachable target (Username / Password / Sign-in). ────────

  it("wires onEnterPress on LOGIN_USERNAME that advances focus to LOGIN_PASSWORD", () => {
    render(<LoginPage onLoginSuccess={() => {}} />);
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusKey?: string; onEnterPress?: () => void }]
    >;
    const username = calls.find((c) => c[0]?.focusKey === "LOGIN_USERNAME");
    expect(username?.[0].onEnterPress).toBeInstanceOf(Function);

    setFocusSpy.mockClear();
    username![0].onEnterPress!();
    expect(setFocusSpy).toHaveBeenCalledWith("LOGIN_PASSWORD");
  });

  it("wires onEnterPress on LOGIN_PASSWORD that submits the form", async () => {
    vi.spyOn(authApi, "login").mockImplementation(async (u) => {
      apiClient.setSession(u);
      return { message: "ok", userId: 1, username: u };
    });
    const onSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "pw" },
    });
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusKey?: string; onEnterPress?: () => void }]
    >;
    const password = calls.find((c) => c[0]?.focusKey === "LOGIN_PASSWORD");
    expect(password?.[0].onEnterPress).toBeInstanceOf(Function);

    password![0].onEnterPress!();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("wires onEnterPress on LOGIN_SUBMIT that submits the form (norigin Enter path)", async () => {
    vi.spyOn(authApi, "login").mockImplementation(async (u) => {
      apiClient.setSession(u);
      return { message: "ok", userId: 1, username: u };
    });
    const onSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "pw" },
    });
    const calls = useFocusableSpy.mock.calls as Array<
      [{ focusKey?: string; onEnterPress?: () => void }]
    >;
    const submit = calls.find((c) => c[0]?.focusKey === "LOGIN_SUBMIT");
    expect(submit?.[0].onEnterPress).toBeInstanceOf(Function);

    submit![0].onEnterPress!();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
