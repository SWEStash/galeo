import type { SettingsNotice } from '../../shared/settings';
import { FsError, type FileSystem } from '../ports';
import { migrate, type Migration } from './model';

export type Parsed<T> = { ok: true; value: T } | { ok: false; detail: string };
/** Validates a migrated file (main passes its schema, SR-17). `schemaVersion` is still in `data`. */
export type Parse<T> = (data: unknown) => Parsed<T>;

/** UTF-8 both ways, injected so core stays free of runtime globals; `decode` throws on invalid input. */
export interface Utf8 {
  decode(bytes: Uint8Array): string;
  encode(text: string): Uint8Array;
}

export interface ConfigFileDeps<T> {
  fs: FileSystem;
  utf8: Utf8;
  path: string;
  parse: Parse<T>;
  /** The value when the file doesn't exist. */
  empty: T;
  version: number;
  migrations: Readonly<Record<number, Migration>>;
  maxBytes: number;
}

export interface Loaded<T> {
  value: T;
  notice: SettingsNotice | null;
}

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

type Read<T> = { kind: 'ok'; value: T } | { kind: 'failed'; notice: SettingsNotice };

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
    const read = await this.read();
    if (read.kind === 'failed') return { value: this.last, notice: read.notice };
    this.last = read.value;
    return { value: read.value, notice: null };
  }

  async update(change: (value: T) => T): Promise<Loaded<T>> {
    const loaded = await this.load();
    if (loaded.notice) return loaded;
    const value = change(loaded.value);
    const { dirname } = splitPath(this.deps.path);
    await this.deps.fs.mkdir(dirname, { mode: DIR_MODE });
    const json = `${JSON.stringify({ schemaVersion: this.deps.version, ...value }, null, 2)}\n`;
    await this.deps.fs.writeFileAtomic(this.deps.path, this.deps.utf8.encode(json), { mode: FILE_MODE });
    this.last = value;
    return { value, notice: null };
  }

  private async read(): Promise<Read<T>> {
    let bytes: Uint8Array;
    try {
      bytes = await this.deps.fs.readFile(this.deps.path, { maxBytes: this.deps.maxBytes });
    } catch (error) {
      if (error instanceof FsError && error.code === 'ENOENT') return { kind: 'ok', value: this.deps.empty };
      if (error instanceof FsError && error.code === 'ETOOBIG') {
        return this.failed('too-large', `larger than ${this.deps.maxBytes} bytes`);
      }
      return this.failed('unreadable', error instanceof FsError ? error.code : null);
    }
    let data: unknown;
    try {
      data = JSON.parse(this.deps.utf8.decode(bytes));
    } catch (error) {
      return this.failed('invalid', error instanceof Error ? error.message : null);
    }
    const migrated = migrate(data, this.deps.version, this.deps.migrations);
    if (migrated.kind === 'newer') return this.failed('newer-version', `version ${migrated.version}`);
    if (migrated.kind === 'invalid') return this.failed('invalid', migrated.detail);
    const parsed = this.deps.parse(migrated.data);
    return parsed.ok ? { kind: 'ok', value: parsed.value } : this.failed('invalid', parsed.detail);
  }

  private failed(reason: SettingsNotice['reason'], detail: string | null): Read<T> {
    return { kind: 'failed', notice: { path: this.deps.path, reason, detail } };
  }
}

function splitPath(path: string): { dirname: string } {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return { dirname: path.slice(0, slash) };
}
