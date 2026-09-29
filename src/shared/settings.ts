export type ThemeMode = 'system' | 'light' | 'dark';

/** Every v0.1 setting (UX §6), as resolved for one profile. */
export interface Settings {
  themeMode: ThemeMode;
  proseFont: string;
  codeFont: string;
  /** Body text size in CSS pixels. */
  fontSize: number;
  /** Reading column width in `ch`. */
  measure: number;
  statusBar: boolean;
  /** Extra folder or file names quick open skips. */
  quickOpenExclude: string[];
  /** Tabs kept rendered besides the active one, per window (ADR-002). */
  warmTabs: number;
  /** Rendered weight those tabs may hold together, in MiB. */
  warmMegabytes: number;
}

/** What a settings file sets; anything it leaves out comes from the level below. */
export type SettingsOverrides = Partial<Settings>;

/** A config file galeo can't use; it is left untouched and the last valid settings stay (SR-17). */
export interface SettingsNotice {
  path: string;
  reason: 'invalid' | 'too-large' | 'newer-version' | 'unreadable';
  detail: string | null;
}

/** A window's colour scheme: its profile's choice, or the desktop's in system mode. */
export function schemeFor(mode: ThemeMode, systemDark: boolean): 'light' | 'dark' {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

/** Where a setting's value comes from: the built-in default, all profiles (`settings.json`), or this profile. */
export type SettingSource = 'default' | 'global' | 'profile';
