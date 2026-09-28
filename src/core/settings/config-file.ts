import type { SettingsNotice } from '../../shared/settings';
import { readJsonFile, writeJsonFile, type JsonFileSpec } from './json-file';

export interface ConfigFileDeps<T> extends JsonFileSpec<T> {
  path: string;
  /** The value when the file doesn't exist. */
  empty: T;
}

export interface Loaded<T> {
  value: T;
  notice: SettingsNotice | null;
}

/**
 * A config file the user may edit by hand (ADR-005, SR-17). An invalid file is left untouched and
 * the last valid value stays in use; galeo writes the file only on a settings change, re-reading
 * it right before, and never over an invalid hand edit.
 */
export class ConfigFile<T> {
  private last: T;

  constructor(private readonly deps: ConfigFileDeps<T>) {
    this.last = deps.empty;
  }

  async load(): Promise<Loaded<T>> {
    const read = await readJsonFile(this.deps, this.deps.path);
    if (read.kind === 'failed') return { value: this.last, notice: read.notice };
    this.last = read.kind === 'ok' ? read.value : this.deps.empty;
    return { value: this.last, notice: null };
  }

  async update(change: (value: T) => T): Promise<Loaded<T>> {
    const loaded = await this.load();
    if (loaded.notice) return loaded;
    const value = change(loaded.value);
    await writeJsonFile(this.deps as JsonFileSpec<unknown>, this.deps.path, value as object);
    this.last = value;
    return { value, notice: null };
  }
}
