import { useState, useEffect, useRef } from "react";
import {
  useFocusable,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { Button } from "../../primitives";
import { login } from "../../api/auth";

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // `requestSubmit()` re-enters the form's onSubmit path AND runs HTML5
  // required-field validation, so it behaves identically to a mouse click
  // on the submit button.
  const submitForm = () => {
    if (!loading) formRef.current?.requestSubmit();
  };

  // Norigin captures Enter at the window level and `preventDefault`s it,
  // which blocks the browser's native Enter-on-focused-button → click →
  // form-submit flow. Every TV-reachable target that should respond to OK
  // must supply its own `onEnterPress`. Below:
  //   - Username Enter → advance to Password (TV input convention)
  //   - Password Enter → submit form
  //   - Submit button Enter → submit form
  const { ref: usernameRef } = useFocusable<HTMLInputElement>({
    focusKey: "LOGIN_USERNAME",
    onEnterPress: () => setFocus("LOGIN_PASSWORD"),
  });
  const { ref: passwordRef } = useFocusable<HTMLInputElement>({
    focusKey: "LOGIN_PASSWORD",
    onEnterPress: submitForm,
  });

  // Prime norigin's focus tree on mount. Raw DOM .focus() would land a
  // blinking caret but leave norigin's lastFocused pointer empty, so the
  // first ArrowDown press on Fire TV would go nowhere. setFocus keeps DOM
  // focus and norigin focus in sync.
  useEffect(() => {
    setFocus("LOGIN_USERNAME");
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      onLoginSuccess();
    } catch {
      setError("Invalid username or password");
      setFocus("LOGIN_USERNAME");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="main"
      style={{
        background: "var(--bg-base)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        aria-label="Login"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          width: 400,
          padding: "var(--space-12)",
        }}
      >
        <h1
          style={{
            color: "var(--text-primary)",
            fontSize: "var(--text-title-size)",
            marginBottom: "var(--space-4)",
          }}
        >
          StreamVault
        </h1>
        {error && (
          <p
            role="alert"
            style={{
              color: "var(--danger)",
              fontSize: "var(--text-body-size)",
            }}
          >
            {error}
          </p>
        )}
        <label
          htmlFor="username"
          style={{
            color: "var(--text-secondary)",
            fontSize: "var(--text-body-size)",
          }}
        >
          Username
        </label>
        <input
          id="username"
          ref={usernameRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          className="focus-ring"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--bg-elevated)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "var(--text-body-size)",
            padding: "var(--space-3) var(--space-4)",
          }}
        />
        <label
          htmlFor="password"
          style={{
            color: "var(--text-secondary)",
            fontSize: "var(--text-body-size)",
          }}
        >
          Password
        </label>
        <input
          id="password"
          ref={passwordRef as React.RefObject<HTMLInputElement>}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="focus-ring"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--bg-elevated)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "var(--text-body-size)",
            padding: "var(--space-3) var(--space-4)",
          }}
        />
        <Button
          type="submit"
          disabled={loading}
          size="lg"
          focusKey="LOGIN_SUBMIT"
          onEnterPress={submitForm}
        >
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
