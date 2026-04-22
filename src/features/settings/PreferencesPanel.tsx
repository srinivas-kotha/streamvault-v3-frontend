/**
 * PreferencesPanel — Playback preference controls.
 *
 * Each option row is D-pad navigable via norigin useFocusable.
 * Persists to localStorage via the preferences module.
 */
import type { RefObject } from "react";
import {
  useFocusable,
  FocusContext,
} from "@noriginmedia/norigin-spatial-navigation";
import {
  getPrefs,
  setPref,
  type SubtitleLang,
  type AudioLang,
  type VideoQuality,
  type AutoplayNextEpisode,
} from "./preferences";
import { useCallback, useReducer } from "react";
import "./settings.css";

// ─── Option chip ─────────────────────────────────────────────────────────────

function OptionChip({
  focusKey,
  label,
  active,
  onSelect,
}: {
  focusKey: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    focusKey,
    onEnterPress: onSelect,
  });

  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      className={`settings-chip${active ? " settings-chip--active" : ""}${focused ? " settings-chip--focused" : ""}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

// ─── Preference row ──────────────────────────────────────────────────────────

function PrefRow<T extends string>({
  label,
  focusKeyPrefix,
  options,
  value,
  onChange,
}: {
  label: string;
  focusKeyPrefix: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="settings-pref-row">
      <span className="settings-pref-label">{label}</span>
      <div className="settings-pref-options" role="group" aria-label={label}>
        {options.map((opt) => (
          <OptionChip
            key={opt.value}
            focusKey={`${focusKeyPrefix}_${opt.value.toUpperCase()}`}
            label={opt.label}
            active={value === opt.value}
            onSelect={() => onChange(opt.value)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

const SUBTITLE_OPTIONS: { value: SubtitleLang; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "ta", label: "Tamil" },
];

const AUDIO_OPTIONS: { value: AudioLang; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "ta", label: "Tamil" },
];

const QUALITY_OPTIONS: { value: VideoQuality; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
];

const AUTOPLAY_OPTIONS: { value: AutoplayNextEpisode; label: string }[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

export function PreferencesPanel() {
  // Use a local re-render trigger since preferences are synchronous localStorage reads
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const prefs = getPrefs();

  const handleChange = useCallback(
    <K extends keyof ReturnType<typeof getPrefs>>(
      key: K,
      value: ReturnType<typeof getPrefs>[K],
    ) => {
      setPref(key, value);
      rerender();
    },
    [],
  );

  const { ref, focusKey } = useFocusable({
    focusKey: "PREFS_PANEL",
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <section
        ref={ref as RefObject<HTMLElement>}
        className="settings-section"
        aria-labelledby="prefs-heading"
      >
        <h2 id="prefs-heading" className="settings-section-title">
          Playback Preferences
        </h2>

        <PrefRow
          label="Subtitle Language"
          focusKeyPrefix="PREF_SUBTITLE"
          options={SUBTITLE_OPTIONS}
          value={prefs.subtitle}
          onChange={(v) => handleChange("subtitle", v)}
        />

        <PrefRow
          label="Audio Language"
          focusKeyPrefix="PREF_AUDIO"
          options={AUDIO_OPTIONS}
          value={prefs.audio}
          onChange={(v) => handleChange("audio", v)}
        />

        <PrefRow
          label="Video Quality"
          focusKeyPrefix="PREF_QUALITY"
          options={QUALITY_OPTIONS}
          value={prefs.quality}
          onChange={(v) => handleChange("quality", v)}
        />

        <PrefRow
          label="Autoplay Next Episode"
          focusKeyPrefix="PREF_AUTOPLAY"
          options={AUTOPLAY_OPTIONS}
          value={prefs.autoplay}
          onChange={(v) => handleChange("autoplay", v)}
        />
      </section>
    </FocusContext.Provider>
  );
}
