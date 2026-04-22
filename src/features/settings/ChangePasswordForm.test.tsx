/**
 * ChangePasswordForm.test.tsx — validation + server error surfacing
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
}));

const changePasswordMock = vi.hoisted(() => vi.fn());
vi.mock("../../api/auth", () => ({
  changePassword: changePasswordMock,
}));

import { ChangePasswordForm } from "./ChangePasswordForm";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderForm(onSuccess = vi.fn(), onCancel = vi.fn()) {
  render(<ChangePasswordForm onSuccess={onSuccess} onCancel={onCancel} />);
  return {
    current: () => screen.getByLabelText(/current password/i),
    // exact: true avoids matching "Confirm New Password"
    newPw: () => screen.getByLabelText("New Password", { exact: true }),
    confirm: () => screen.getByLabelText(/confirm new password/i),
    submit: () => screen.getByRole("button", { name: /save/i }),
    cancel: () => screen.getByRole("button", { name: /cancel/i }),
    error: () => screen.queryByRole("alert"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ChangePasswordForm validation", () => {
  it("shows error when new password is too short", async () => {
    const user = userEvent.setup();
    const { current, newPw, confirm, submit } = renderForm();

    await user.type(current(), "oldpassword");
    await user.type(newPw(), "short"); // < 12 chars
    await user.type(confirm(), "short");
    await user.click(submit());

    expect(
      await screen.findByText(/at least 12 characters/i),
    ).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("shows error when passwords do not match", async () => {
    const user = userEvent.setup();
    const { current, newPw, confirm, submit } = renderForm();

    await user.type(current(), "oldpassword");
    await user.type(newPw(), "validpassword123");
    await user.type(confirm(), "doesnotmatch123");
    await user.click(submit());

    expect(
      await screen.findByText(/do not match/i),
    ).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("calls changePassword when validation passes", async () => {
    changePasswordMock.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    const { current, newPw, confirm, submit } = renderForm(onSuccess);

    await user.type(current(), "oldpassword");
    await user.type(newPw(), "validpassword123");
    await user.type(confirm(), "validpassword123");
    await user.click(submit());

    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith(
        "oldpassword",
        "validpassword123",
      );
    });
    expect(onSuccess).toHaveBeenCalled();
  });
});

describe("ChangePasswordForm server error", () => {
  it("surfaces API error message", async () => {
    changePasswordMock.mockRejectedValueOnce(
      new Error("Current password is incorrect"),
    );
    const user = userEvent.setup();
    const { current, newPw, confirm, submit } = renderForm();

    await user.type(current(), "wrongoldpassword");
    await user.type(newPw(), "validpassword123");
    await user.type(confirm(), "validpassword123");
    await user.click(submit());

    expect(
      await screen.findByText(/current password is incorrect/i),
    ).toBeInTheDocument();
  });

  it("shows generic message for non-Error throws", async () => {
    changePasswordMock.mockRejectedValueOnce("network failure");
    const user = userEvent.setup();
    const { current, newPw, confirm, submit } = renderForm();

    await user.type(current(), "somepassword");
    await user.type(newPw(), "validpassword123");
    await user.type(confirm(), "validpassword123");
    await user.click(submit());

    expect(await screen.findByText(/an error occurred/i)).toBeInTheDocument();
  });
});

describe("ChangePasswordForm cancel", () => {
  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { cancel } = renderForm(vi.fn(), onCancel);

    await user.click(cancel());
    expect(onCancel).toHaveBeenCalled();
  });
});
