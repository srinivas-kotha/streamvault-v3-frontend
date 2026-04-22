/**
 * ChangePasswordForm — inline form for changing password.
 *
 * Validation:
 *   - New password must be ≥ 12 characters
 *   - Confirm must match new
 *
 * On success: calls onSuccess() (parent handles logout).
 * On failure: surfaces the API error message.
 */
import type { RefObject } from "react";
import { useState } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { changePassword } from "../../api/auth";
import "./settings.css";

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function ChangePasswordForm({ onSuccess, onCancel }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const { ref: currentRef } = useFocusable<HTMLInputElement>({
    focusKey: "CHANGEPW_CURRENT",
  });
  const { ref: nextRef } = useFocusable<HTMLInputElement>({
    focusKey: "CHANGEPW_NEW",
  });
  const { ref: confirmRef } = useFocusable<HTMLInputElement>({
    focusKey: "CHANGEPW_CONFIRM",
  });
  const { ref: submitRef, focused: submitFocused } =
    useFocusable<HTMLButtonElement>({
      focusKey: "CHANGEPW_SUBMIT",
      onEnterPress: () => handleSubmit(),
    });
  const { ref: cancelRef, focused: cancelFocused } =
    useFocusable<HTMLButtonElement>({
      focusKey: "CHANGEPW_CANCEL",
      onEnterPress: onCancel,
    });

  function validate(): string | null {
    if (next.length < 12) return "New password must be at least 12 characters.";
    if (next !== confirm) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit() {
    setServerError(null);
    const err = validate();
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await changePassword(current, next);
      onSuccess();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "An error occurred. Please try again.";
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const error = fieldError ?? serverError;

  return (
    <form
      className="settings-changepw-form"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
      aria-label="Change password"
      noValidate
    >
      <div className="settings-form-field">
        <label htmlFor="pw-current" className="settings-form-label">
          Current Password
        </label>
        <input
          id="pw-current"
          ref={currentRef as RefObject<HTMLInputElement>}
          type="password"
          className="settings-form-input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          disabled={submitting}
          aria-required="true"
        />
      </div>

      <div className="settings-form-field">
        <label htmlFor="pw-new" className="settings-form-label">
          New Password
        </label>
        <input
          id="pw-new"
          ref={nextRef as RefObject<HTMLInputElement>}
          type="password"
          className="settings-form-input"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setFieldError(null);
          }}
          autoComplete="new-password"
          disabled={submitting}
          aria-required="true"
          aria-describedby={error ? "pw-error" : undefined}
        />
        <span className="settings-form-hint">Minimum 12 characters</span>
      </div>

      <div className="settings-form-field">
        <label htmlFor="pw-confirm" className="settings-form-label">
          Confirm New Password
        </label>
        <input
          id="pw-confirm"
          ref={confirmRef as RefObject<HTMLInputElement>}
          type="password"
          className="settings-form-input"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setFieldError(null);
          }}
          autoComplete="new-password"
          disabled={submitting}
          aria-required="true"
          aria-describedby={error ? "pw-error" : undefined}
        />
      </div>

      {error && (
        <p id="pw-error" className="settings-form-error" role="alert">
          {error}
        </p>
      )}

      <div className="settings-form-actions">
        <button
          ref={submitRef as RefObject<HTMLButtonElement>}
          type="submit"
          className={`settings-btn settings-btn--primary${submitFocused ? " settings-btn--focused" : ""}`}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          ref={cancelRef as RefObject<HTMLButtonElement>}
          type="button"
          className={`settings-btn settings-btn--ghost${cancelFocused ? " settings-btn--focused" : ""}`}
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
