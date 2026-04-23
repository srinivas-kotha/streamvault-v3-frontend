/**
 * EmptyStateWithLanguageSwitch — shown when a content surface returns no
 * items under the current language filter. Offers one-click buttons to
 * switch to a different language ("Try Hindi", "Try English", "Show All")
 * instead of dead-ending the user.
 *
 * Replaces the deferred "loosen filter" empty state from the previous
 * Movies spec — that required facet counts the backend doesn't ship.
 * Language-switch is an honest fallback: we know which langs exist (5
 * well-known ids), so every button is guaranteed to resolve to content.
 *
 * Spec: `docs/ux/03-movies.md` empty state; `docs/ux/00-ia-navigation.md` §6.4.
 */
import type { CSSProperties, RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { LangId } from "../lib/langPref";

const LANG_LABELS: Record<LangId, string> = {
  telugu: "Telugu",
  hindi: "Hindi",
  english: "English",
  sports: "Sports",
  all: "All",
};

export interface EmptyStateWithLanguageSwitchProps {
  /** The currently active filter. Its suggestion button is NOT rendered. */
  currentLang: LangId;
  /** Called when the user activates a suggestion button. */
  onSwitch: (lang: LangId) => void;
  /** Top-line copy. Defaults to a generic "No items" message. */
  headline?: string;
  /** Sub-line copy. Defaults to a prompt to try another language. */
  message?: string;
  /**
   * Suggestions to offer, in order. Defaults to ["hindi","english","all"]
   * (minus whichever matches currentLang). Callers on Live can pass
   * ["hindi","english","sports","all"] when Sports is relevant.
   */
  suggestions?: LangId[];
  /**
   * Focus key prefix for the rendered buttons. Each button registers as
   * `{focusKeyPrefix}_{LANG}`. Defaults to "EMPTY_LANG_SWITCH".
   */
  focusKeyPrefix?: string;
}

const shellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-6)",
  minHeight: 320,
  padding: "var(--space-8) var(--space-6)",
  textAlign: "center",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "var(--space-3)",
};

function SwitchButton({
  lang,
  focusKey,
  onSelect,
}: {
  lang: LangId;
  focusKey: string;
  onSelect: () => void;
}) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: onSelect,
  });
  const label = lang === "all" ? "Show All" : `Try ${LANG_LABELS[lang]}`;

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      onClick={onSelect}
      className="focus-ring"
      style={{
        padding: "var(--space-3) var(--space-6)",
        borderRadius: "var(--radius-pill)",
        border: focused
          ? "2px solid var(--accent-copper)"
          : "2px solid rgba(200, 121, 65, 0.3)",
        background: focused
          ? "var(--accent-copper)"
          : "rgba(200, 121, 65, 0.12)",
        color: focused ? "var(--bg-base)" : "var(--text-primary)",
        fontSize: "var(--text-body-size)",
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background var(--motion-focus), color var(--motion-focus), border-color var(--motion-focus)",
      }}
    >
      {label}
    </button>
  );
}

export function EmptyStateWithLanguageSwitch({
  currentLang,
  onSwitch,
  headline = "No items to show",
  message = "This language is empty — try another.",
  suggestions,
  focusKeyPrefix = "EMPTY_LANG_SWITCH",
}: EmptyStateWithLanguageSwitchProps) {
  const defaults: LangId[] = ["hindi", "english", "all"];
  const effective = (suggestions ?? defaults).filter((l) => l !== currentLang);

  return (
    <div role="status" aria-live="polite" style={shellStyle}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: "var(--type-title)",
            fontWeight: 600,
            lineHeight: "var(--type-title-line)",
            color: "var(--text-primary)",
          }}
        >
          {headline}
        </h2>
        <p
          style={{
            marginTop: "var(--space-3)",
            marginBottom: 0,
            fontSize: "var(--type-body-sm)",
            lineHeight: "var(--type-body-sm-line)",
            color: "var(--text-secondary)",
          }}
        >
          {message}
        </p>
      </div>
      <div style={buttonRowStyle}>
        {effective.map((lang) => (
          <SwitchButton
            key={lang}
            lang={lang}
            focusKey={`${focusKeyPrefix}_${lang.toUpperCase()}`}
            onSelect={() => onSwitch(lang)}
          />
        ))}
      </div>
    </div>
  );
}
