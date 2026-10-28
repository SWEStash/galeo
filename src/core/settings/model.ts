import { DEFAULT_SETTINGS, type SettingSource, type Settings, type SettingsOverrides } from '../../shared/settings';
import { keysOf } from '../../shared/records';

/** Built-in defaults, then the global file, then the profile's overrides (ADR-005). */
export function resolveSettings(global: SettingsOverrides, profile: SettingsOverrides): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const level of [global, profile]) {
    for (const [key, value] of Object.entries(level)) {
      if (Object.hasOwn(DEFAULT_SETTINGS, key)) Object.assign(settings, { [key]: value });
    }
  }
  return settings;
}

/** Turns a file of version `n` into version `n + 1`. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

type Migrated =
  | { kind: 'ok'; data: Record<string, unknown> }
  | { kind: 'newer'; version: number }
  | { kind: 'invalid'; detail: string };

/**
 * Brings a parsed file up to `current`, forward only. A hand-written file without `schemaVersion`
 * counts as version 1.
 */
export function migrate(data: unknown, current: number, migrations: Readonly<Record<number, Migration>>): Migrated {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { kind: 'invalid', detail: 'expected a JSON object' };
  }
  let object = data as Record<string, unknown>;
  const version = object['schemaVersion'] ?? 1;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'invalid', detail: 'schemaVersion must be a positive whole number' };
  }
  if (version > current) return { kind: 'newer', version };
  for (let from = version; from < current; from++) {
    const step = migrations[from];
    if (!step) return { kind: 'invalid', detail: `no migration from version ${from}` };
    object = step(object);
  }
  return { kind: 'ok', data: { ...object, schemaVersion: current } };
}

/** Where each setting's value comes from, given the global file's and the profile's overrides. */
export function settingSources(global: SettingsOverrides, profile: SettingsOverrides): Record<keyof Settings, SettingSource> {
  const keys = keysOf(DEFAULT_SETTINGS);
  return Object.fromEntries(keys.map((key) => [key, key in profile ? 'profile' : key in global ? 'global' : 'default'])) as Record<
    keyof Settings,
    SettingSource
  >;
}
