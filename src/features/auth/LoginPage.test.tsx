import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginPage } from "./LoginPage";
import * as authApi from "../../api/auth";
import { apiClient } from "../../api/client";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    // Mock login() to imitate real behavior: set session sentinel + return
    // the cookie-based LoginResponse shape.
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
    // No session stored on failure.
    expect(apiClient.hasSession()).toBe(false);
  });
});
