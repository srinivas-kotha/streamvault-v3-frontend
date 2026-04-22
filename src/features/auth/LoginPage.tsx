import { useState, useRef, useEffect } from "react";
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
  const usernameRef = useRef<HTMLInputElement>(null);

  // Focus the username field on mount — a11y-safe equivalent of autoFocus
  // (jsx-a11y forbids autoFocus attribute; effect-based focus is allowed
  // because it runs after the app decides to show LoginPage rather than
  // on every page load).
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Backend sets httpOnly auth cookies; login() records the session
      // sentinel used by the App-level auth gate. Nothing else to do here.
      await login(username, password);
      onLoginSuccess();
    } catch {
      setError("Invalid username or password");
      usernameRef.current?.focus();
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
          ref={usernameRef}
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
        <Button type="submit" disabled={loading} size="lg">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
