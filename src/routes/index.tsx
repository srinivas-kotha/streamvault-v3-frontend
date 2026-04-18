/**
 * TestPrimitivesRoute — dev-time fixture for axe-core and visual regression (Task 1.7)
 *
 * Renders every Oxide primitive at all supported variants / sizes so that:
 *   - axe-core Playwright tests can audit WCAG contrast on the full matrix
 *   - Visual-regression screenshots capture baseline appearance
 *   - Manual QA can inspect focus-ring, hover, and motion states
 *
 * This route is NOT ephemeral — it stays in the repo as the primitive fixture.
 * In production the root App.tsx path-guard means it is unreachable at "/".
 *
 * Route: /test-primitives (path-switched in App.tsx)
 */
import React from "react";
import { Button, Card, Skeleton, FocusRing, ErrorShell } from "../primitives";

const sectionStyle: React.CSSProperties = {
  marginBottom: "var(--space-12, 48px)",
};

const headingStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: "var(--text-label-size, 14px)",
  letterSpacing: "var(--text-label-tracking, 1.5px)",
  textTransform: "uppercase",
  marginBottom: "var(--space-4, 16px)",
  fontFamily: "var(--font-ui)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--space-4, 16px)",
  alignItems: "flex-start",
};

export function TestPrimitivesRoute(): React.ReactElement {
  return (
    <div
      style={{
        background: "var(--bg-base)",
        minHeight: "100vh",
        padding: "var(--space-12, 48px)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <h1
        style={{
          color: "var(--text-primary)",
          fontSize: "var(--text-title-size, 32px)",
          marginBottom: "var(--space-12, 48px)",
        }}
      >
        Oxide Primitives — Phase 1 Fixture
      </h1>

      {/* ── Button — variants ──────────────────────────────────────────── */}
      <section aria-labelledby="btn-variants-heading" style={sectionStyle}>
        <h2 id="btn-variants-heading" style={headingStyle}>
          Button — Variants
        </h2>
        <div style={rowStyle}>
          <Button variant="primary">Primary</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </section>

      {/* ── Button — sizes ────────────────────────────────────────────── */}
      <section aria-labelledby="btn-sizes-heading" style={sectionStyle}>
        <h2 id="btn-sizes-heading" style={headingStyle}>
          Button — Sizes
        </h2>
        <div style={rowStyle}>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="md">
            Medium
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="outlined" size="sm">
            Outlined sm
          </Button>
          <Button variant="outlined" size="md">
            Outlined md
          </Button>
          <Button variant="outlined" size="lg">
            Outlined lg
          </Button>
          <Button variant="ghost" size="sm">
            Ghost sm
          </Button>
          <Button variant="ghost" size="md">
            Ghost md
          </Button>
          <Button variant="ghost" size="lg">
            Ghost lg
          </Button>
        </div>
      </section>

      {/* ── Card — focusable + non-focusable ──────────────────────────── */}
      <section aria-labelledby="card-heading" style={sectionStyle}>
        <h2 id="card-heading" style={headingStyle}>
          Card
        </h2>
        <div style={rowStyle}>
          {/* Card doesn't accept style prop — wrap in a sized div */}
          <div style={{ width: 160, height: 100 }}>
            <Card className="h-full">
              <span style={{ color: "var(--text-primary)", padding: "8px" }}>
                Non-focusable
              </span>
            </Card>
          </div>
          <div style={{ width: 160, height: 100 }}>
            <Card focusable aria-label="Focusable card" className="h-full">
              <span style={{ color: "var(--text-primary)", padding: "8px" }}>
                Focusable
              </span>
            </Card>
          </div>
          <div style={{ width: 200 }}>
            <Card aspectRatio="16/9">
              <span style={{ color: "var(--text-primary)", padding: "8px" }}>
                16/9
              </span>
            </Card>
          </div>
          <div style={{ width: 120 }}>
            <Card aspectRatio="2/3">
              <span style={{ color: "var(--text-primary)", padding: "8px" }}>
                2/3
              </span>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Skeleton ──────────────────────────────────────────────────── */}
      <section aria-labelledby="skeleton-heading" style={sectionStyle}>
        <h2 id="skeleton-heading" style={headingStyle}>
          Skeleton
        </h2>
        <div style={rowStyle}>
          <Skeleton width={200} height={20} />
          <Skeleton width={160} height={20} />
          <Skeleton width={120} height={20} />
          <Skeleton width={200} height={120} />
        </div>
      </section>

      {/* ── FocusRing (wrapping a button) ─────────────────────────────── */}
      <section aria-labelledby="focusring-heading" style={sectionStyle}>
        <h2 id="focusring-heading" style={headingStyle}>
          FocusRing
        </h2>
        <div style={rowStyle}>
          <FocusRing variant="standard">
            <button
              type="button"
              style={{
                color: "var(--text-primary)",
                background: "var(--bg-surface)",
                border: "none",
                padding: "8px 16px",
                borderRadius: "8px",
              }}
            >
              Standard ring
            </button>
          </FocusRing>
          <FocusRing variant="imagery">
            <button
              type="button"
              style={{
                color: "var(--text-primary)",
                background: "var(--bg-elevated)",
                border: "none",
                padding: "8px 16px",
                borderRadius: "8px",
              }}
            >
              Imagery ring
            </button>
          </FocusRing>
        </div>
      </section>

      {/* ── ErrorShell — all button configs ───────────────────────────── */}
      <section aria-labelledby="error-heading" style={sectionStyle}>
        <h2 id="error-heading" style={headingStyle}>
          ErrorShell
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-8, 32px)",
          }}
        >
          <ErrorShell
            title="Playback error"
            subtext="Unable to load stream. Check your connection and try again."
            icon="warning"
            onRetry={() => undefined}
          />
          <ErrorShell
            title="Network unavailable"
            icon="network"
            onRetry={() => undefined}
            onBack={() => undefined}
          />
          <ErrorShell
            title="Nothing here"
            subtext="This section is empty."
            icon="empty"
            onRetry={() => undefined}
            onBack={() => undefined}
            onReport={() => undefined}
          />
        </div>
      </section>
    </div>
  );
}
