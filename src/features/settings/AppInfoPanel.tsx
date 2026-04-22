/**
 * AppInfoPanel — shows app version, build hash, and legal links.
 */
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { RefObject } from "react";
import "./settings.css";

// Version injected at build time via Vite define (see vite.config.ts).
// Falls back to pkg version if not defined.
const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.0.0";
const BUILD_HASH =
  (import.meta.env.VITE_BUILD_HASH as string | undefined) ?? "dev";

function LinkItem({
  focusKey,
  label,
  href,
}: {
  focusKey: string;
  label: string;
  href: string;
}) {
  const { ref, focused } = useFocusable<HTMLAnchorElement>({
    focusKey,
    onEnterPress: () => {
      window.open(href, "_blank", "noopener,noreferrer");
    },
  });

  return (
    <a
      ref={ref as RefObject<HTMLAnchorElement>}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`settings-link${focused ? " settings-link--focused" : ""}`}
    >
      {label}
    </a>
  );
}

export function AppInfoPanel() {
  return (
    <section className="settings-section" aria-labelledby="appinfo-heading">
      <h2 id="appinfo-heading" className="settings-section-title">
        App Info
      </h2>

      <dl className="settings-info-list">
        <div className="settings-info-row">
          <dt className="settings-info-key">Version</dt>
          <dd className="settings-info-val">{APP_VERSION}</dd>
        </div>
        <div className="settings-info-row">
          <dt className="settings-info-key">Build</dt>
          <dd className="settings-info-val settings-info-mono">{BUILD_HASH}</dd>
        </div>
      </dl>

      <div className="settings-link-row">
        <LinkItem
          focusKey="APPINFO_PRIVACY"
          label="Privacy Policy"
          href="about:blank"
        />
        <LinkItem
          focusKey="APPINFO_TERMS"
          label="Terms of Service"
          href="about:blank"
        />
      </div>
    </section>
  );
}
