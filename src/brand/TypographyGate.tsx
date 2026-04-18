/**
 * TypographyGate — Task 1.2 ephemeral test component.
 * Renders all 6 type-scale tokens on the Oxide background so the
 * controller can verify legibility at 2 m TV distance (1920×1080).
 *
 * DELETE this file after the gate is confirmed (Phase B).
 */
export function TypographyGate() {
  return (
    <div
      style={{
        background: "var(--bg-base)",
        padding: "48px",
        minHeight: "100vh",
        fontFamily: "var(--font-ui)",
        // Reset scaffold centering so the gate shows real left-aligned TV layout
        textAlign: "left",
        width: "100%",
        boxSizing: "border-box",
        maxWidth: "none",
      }}
    >
      {/* ── Hero ──────────────────────────────────────── */}
      <p
        style={{
          fontSize: "var(--text-hero-size)",
          lineHeight: "var(--text-hero-line)",
          fontWeight: "var(--text-hero-weight)",
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        Hero: Live TV — Breaking Now
      </p>

      {/* ── Title ─────────────────────────────────────── */}
      <p
        style={{
          fontSize: "var(--text-title-size)",
          lineHeight: "var(--text-title-line)",
          fontWeight: "var(--text-title-weight)",
          color: "var(--text-primary)",
          marginTop: "24px",
          marginBottom: 0,
        }}
      >
        Title: StreamVault — Movies & Series
      </p>

      {/* ── Body LG ───────────────────────────────────── */}
      <p
        style={{
          fontSize: "var(--text-body-lg-size)",
          lineHeight: "var(--text-body-lg-line)",
          fontWeight: "var(--text-body-lg-weight)",
          color: "var(--text-primary)",
          marginTop: "16px",
          marginBottom: 0,
        }}
      >
        Body LG: Discover thousands of live channels, on-demand films, and
        premium series in one warm, distraction-free interface.
      </p>

      {/* ── Body ──────────────────────────────────────── */}
      <p
        style={{
          fontSize: "var(--text-body-size)",
          lineHeight: "var(--text-body-line)",
          fontWeight: "var(--text-body-weight)",
          color: "var(--text-secondary)",
          marginTop: "12px",
          marginBottom: 0,
        }}
      >
        Body: 9:00 PM – 10:00 PM • Documentary • HD • Subtitles available in 12
        languages. Rated 12+. Runtime 58 min.
      </p>

      {/* ── Label ─────────────────────────────────────── */}
      <p
        style={{
          fontSize: "var(--text-label-size)",
          lineHeight: "var(--text-label-line)",
          fontWeight: "var(--text-label-weight)",
          letterSpacing: "var(--text-label-tracking)",
          color: "var(--text-primary)",
          textTransform: "uppercase",
          marginTop: "12px",
          marginBottom: 0,
        }}
      >
        Label: HD • CC • Live Now
      </p>

      {/* ── Caption ───────────────────────────────────── */}
      <p
        style={{
          fontSize: "var(--text-caption-size)",
          lineHeight: "var(--text-caption-line)",
          fontWeight: "var(--text-caption-weight)",
          color: "var(--text-tertiary)",
          marginTop: "8px",
          marginBottom: 0,
        }}
      >
        Caption: Channel 101 • BBC World News • Updated 2 min ago • Settings •
        Account • Help
      </p>

      {/* ── Divider + secondary tone demo ─────────────── */}
      <div
        style={{
          marginTop: "48px",
          borderTop: "1px solid rgba(237,228,211,0.12)",
          paddingTop: "32px",
        }}
      >
        <p
          style={{
            fontSize: "var(--text-title-size)",
            fontWeight: "var(--text-title-weight)",
            color: "var(--text-secondary)",
            margin: 0,
          }}
        >
          Secondary tone — Title: Recommended for You
        </p>
        <p
          style={{
            fontSize: "var(--text-body-size)",
            fontWeight: "var(--text-body-weight)",
            color: "var(--text-tertiary)",
            marginTop: "12px",
            marginBottom: 0,
          }}
        >
          Tertiary tone — Body: Based on your recent watch history
        </p>
      </div>
    </div>
  );
}
