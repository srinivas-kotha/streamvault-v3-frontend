/**
 * preferences.ts — Playback preference store backed by localStorage.
 *
 * Keys: sv_pref_subtitle | sv_pref_audio | sv_pref_quality | sv_pref_autoplay
 *
 * API:
 *   getPrefs()          → current snapshot
 *   setPref(key, val)   → write + notify subscribers
 *   subscribePref(fn)   → add listener; returns unsubscribe
 */

export type SubtitleLang = "off" | "en" | "hi" | "te" | "ta";
export type AudioLang = "auto" | "en" | "hi" | "te" | "ta";
export type VideoQuality = "auto" | "1080p" | "720p" | "480p";
export type AutoplayNextEpisode = "on" | "off";

export interface Preferences {
  subtitle: SubtitleLang;
  audio: AudioLang;
  quality: VideoQuality;
  autoplay: AutoplayNextEpisode;
}

const STORAGE_KEYS: Record<keyof Preferences, string> = {
  subtitle: "sv_pref_subtitle",
  audio: "sv_pref_audio",
  quality: "sv_pref_quality",
  autoplay: "sv_pref_autoplay",
};

const DEFAULTS: Preferences = {
  subtitle: "off",
  audio: "auto",
  quality: "auto",
  autoplay: "on",
};

type Listener = (prefs: Preferences) => void;
const listeners = new Set<Listener>();

function readPref<K extends keyof Preferences>(key: K): Preferences[K] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    if (raw !== null) return raw as Preferences[K];
  } catch {
    // SSR / private mode
  }
  return DEFAULTS[key];
}

export function getPrefs(): Preferences {
  return {
    subtitle: readPref("subtitle"),
    audio: readPref("audio"),
    quality: readPref("quality"),
    autoplay: readPref("autoplay"),
  };
}

export function setPref<K extends keyof Preferences>(
  key: K,
  value: Preferences[K],
): void {
  try {
    localStorage.setItem(STORAGE_KEYS[key], value);
  } catch {
    // storage quota / private mode — still notify in-memory listeners
  }
  const updated = getPrefs();
  listeners.forEach((fn) => fn(updated));
}

export function subscribePref(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
