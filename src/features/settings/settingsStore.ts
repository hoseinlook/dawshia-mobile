import { File, Paths } from 'expo-file-system';

import { DEFAULT_LOCALE, isLocale, type Locale } from '../../i18n/locales';

/** Device-local user preferences (not synced to the server). */
export interface Settings {
  locale: Locale;
  /** Voice cheers after each valid rep. */
  soundEnabled: boolean;
  /** Match music and sound effects (countdown, horn, final-seconds music, buzzer, fanfare). */
  musicEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: DEFAULT_LOCALE,
  soundEnabled: true,
  musicEnabled: true,
};

const FILE_NAME = 'settings.json';

function settingsFile(): File {
  return new File(Paths.document, FILE_NAME);
}

/** Reads saved settings synchronously so the first render already uses them. */
export function loadSettings(): Settings {
  let raw: Partial<Settings> = {};
  try {
    const file = settingsFile();
    if (file.exists) raw = JSON.parse(file.textSync()) as Partial<Settings>;
  } catch {
    // Corrupt file: start from defaults.
  }
  return {
    locale: isLocale(raw.locale) ? raw.locale : DEFAULT_SETTINGS.locale,
    soundEnabled:
      typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    musicEnabled:
      typeof raw.musicEnabled === 'boolean' ? raw.musicEnabled : DEFAULT_SETTINGS.musicEnabled,
  };
}

export function saveSettings(settings: Settings): void {
  try {
    settingsFile().write(JSON.stringify(settings));
  } catch {
    // Not critical: the app keeps working with in-memory settings.
  }
}
