import type { PreviousSession } from '../../shared/contracts';
import { joinPath } from '../../shared/paths';
import type { SettingsNotice } from '../../shared/settings';
import type { FileSystem } from '../ports';
import { moveIfPresent, readJsonFile, writeJsonFile, type JsonFileSpec, type Parse, type Utf8 } from '../settings/json-file';
import { SESSION_VERSION, type SessionFile } from './model';

/** Sessions hold paths and positions only; a bigger file is refused, not parsed (SR-17). */
const SESSION_MAX_BYTES = 4 * 1024 * 1024;
const SNAPSHOTS = [1, 2, 3] as const;

export interface SessionStoreDeps {
  fs: FileSystem;
  utf8: Utf8;
  /** The profile's state folder (`profiles/<id>` in the state directory). */
  dir: string;
  parse: Parse<SessionFile>;
}

/**
 * A profile's `session.json` and its snapshots `.1` to `.3` (ADR-005). An invalid session is backed
 * up to `session.json.invalid`, then the newest valid snapshot takes its place (SR-17). The first
 * save of a run rotates the previous file into the snapshots, so they are the last runs' sessions.
 */
export class SessionStore {
  private readonly spec: JsonFileSpec<SessionFile>;
  private readonly file: string;
  private rotated = false;
  /** Saves run one after another: a save never starts before the one before it has rotated and written. */
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly deps: SessionStoreDeps) {
    this.spec = { fs: deps.fs, utf8: deps.utf8, parse: deps.parse, version: SESSION_VERSION, migrations: {}, maxBytes: SESSION_MAX_BYTES };
    this.file = joinPath(deps.dir, 'session.json');
  }

  async load(): Promise<{ session: SessionFile | null; notice: SettingsNotice | null }> {
    const read = await readJsonFile(this.spec, this.file);
    if (read.kind === 'ok') return { session: read.value, notice: null };
    if (read.kind === 'failed') await moveIfPresent(this.deps.fs, this.file, `${this.file}.invalid`);
    // A missing session with snapshots is a run stopped between rotating and writing.
    const [newest] = await this.validSnapshots();
    return { session: newest?.session ?? null, notice: read.kind === 'failed' ? read.notice : null };
  }

  save(session: SessionFile): Promise<void> {
    const write = this.writing.then(() => this.write(session));
    this.writing = write.catch(() => {});
    return write;
  }

  /** Settles once every save asked for so far has landed (or failed). */
  idle(): Promise<void> {
    return this.writing;
  }

  private async write(session: SessionFile): Promise<void> {
    if (!this.rotated) {
      this.rotated = true;
      for (const n of [...SNAPSHOTS].reverse()) {
        await moveIfPresent(this.deps.fs, n === 1 ? this.file : `${this.file}.${n - 1}`, `${this.file}.${n}`);
      }
    }
    await writeJsonFile(this.spec as JsonFileSpec<unknown>, this.file, session);
  }

  /** The valid previous sessions, newest first, for "Restore previous session". */
  async previous(): Promise<PreviousSession[]> {
    return (await this.validSnapshots()).map(({ snapshot, session }) => ({
      snapshot,
      savedAt: session.savedAt,
      windows: session.windows.length,
      tabs: session.windows.reduce((sum, window) => sum + window.tabs.length, 0),
    }));
  }

  async readPrevious(snapshot: number): Promise<SessionFile | null> {
    return (await this.validSnapshots()).find((each) => each.snapshot === snapshot)?.session ?? null;
  }

  private async validSnapshots(): Promise<{ snapshot: number; session: SessionFile }[]> {
    const valid = [];
    for (const snapshot of SNAPSHOTS) {
      const read = await readJsonFile(this.spec, `${this.file}.${snapshot}`);
      if (read.kind === 'ok') valid.push({ snapshot, session: read.value });
    }
    return valid;
  }
}
