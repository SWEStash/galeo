import type { SettingsNotice } from '../../shared/settings';
import { readJsonFile, writeJsonFile, type JsonFileSpec } from './json-file';

interface ConfigFileDeps<T> extends JsonFileSpec<T> {
  path: string;
  /** The value when the file doesn't exist. */
  empty: T;
}

interface Loaded<T> {
  value: T;
  notice: SettingsNotice | null;
}

/**
 * Updates in progress by path. Several profiles' settings share `settings.json`, and a profile's
 * file is also written by renames: each read-modify-write waits for the one before.
 */
const updates = new Map<string, Promise<void>>();

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

  /** Read, change, write: one at a time per file, across every instance for that path. */
  update(change: (value: T) => T): Promise<Loaded<T>> {
    const path = this.deps.path;
    const done = (updates.get(path) ?? Promise.resolve()).then(async () => {
      const loaded = await this.load();
      if (loaded.notice) return loaded;
      const value = change(loaded.value);
      await writeJsonFile(this.deps as JsonFileSpec<unknown>, path, value as object);
      this.last = value;
      return { value, notice: null };
    });
    const queued = done.then(
      () => {},
      () => {},
    );
    updates.set(path, queued);
    void queued.then(() => updates.get(path) === queued && updates.delete(path));
    return done;
  }
}
