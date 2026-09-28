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

/** How one kind of JSON file is read and written. */
export interface JsonFileSpec<T> {
  fs: FileSystem;
  utf8: Utf8;
  parse: Parse<T>;
  version: number;
  migrations: Readonly<Record<number, Migration>>;
  maxBytes: number;
}

export type JsonRead<T> = { kind: 'ok'; value: T } | { kind: 'missing' } | { kind: 'failed'; notice: SettingsNotice };

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** Reads, migrates and validates a JSON file; any problem is a notice naming it, never an error (SR-17). */
export async function readJsonFile<T>(spec: JsonFileSpec<T>, path: string): Promise<JsonRead<T>> {
  const failed = (reason: SettingsNotice['reason'], detail: string | null): JsonRead<T> => ({
    kind: 'failed',
    notice: { path, reason, detail },
  });
  let bytes: Uint8Array;
  try {
    bytes = await spec.fs.readFile(path, { maxBytes: spec.maxBytes });
  } catch (error) {
    if (error instanceof FsError && error.code === 'ENOENT') return { kind: 'missing' };
    if (error instanceof FsError && error.code === 'ETOOBIG') return failed('too-large', `larger than ${spec.maxBytes} bytes`);
    return failed('unreadable', error instanceof FsError ? error.code : null);
  }
  let data: unknown;
  try {
    data = JSON.parse(spec.utf8.decode(bytes));
  } catch (error) {
    return failed('invalid', error instanceof Error ? error.message : null);
  }
  const migrated = migrate(data, spec.version, spec.migrations);
  if (migrated.kind === 'newer') return failed('newer-version', `version ${migrated.version}`);
  if (migrated.kind === 'invalid') return failed('invalid', migrated.detail);
  const parsed = spec.parse(migrated.data);
  return parsed.ok ? { kind: 'ok', value: parsed.value } : failed('invalid', parsed.detail);
}

/** Writes `value` with its `schemaVersion`, atomically, owner-only (SR-16), creating its folder. */
export async function writeJsonFile(spec: JsonFileSpec<unknown>, path: string, value: object): Promise<void> {
  await spec.fs.mkdir(dirnameOf(path), { mode: DIR_MODE });
  const json = `${JSON.stringify({ schemaVersion: spec.version, ...value }, null, 2)}\n`;
  await spec.fs.writeFileAtomic(path, spec.utf8.encode(json), { mode: FILE_MODE });
}

export function dirnameOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
}
