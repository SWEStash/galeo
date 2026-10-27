import type { FileSystem } from '../ports';
import { moveIfPresent, readJsonFile, writeJsonFile, type JsonFileSpec, type Parse, type Utf8 } from '../settings/json-file';

/** A file the profile opened: its path and when, nothing of its content (SR-16). */
export interface RecentFile {
  path: string;
  openedAt: number;
}

const RECENT_MAX = 200;
const RECENT_MAX_BYTES = 1024 * 1024;

interface RecentFilesDeps {
  fs: FileSystem;
  utf8: Utf8;
  path: string;
  parse: Parse<{ files: RecentFile[] }>;
  now: () => number;
}

/** A profile's recent files (ADR-005): newest first, at most 200, files that are gone dropped on load. */
export class RecentFiles {
  private files: RecentFile[] = [];
  private readonly spec: JsonFileSpec<{ files: RecentFile[] }>;
  /** Writes run one after another, each with the list as it is by then. */
  private writing: Promise<void> = Promise.resolve();
  private changes: Promise<void> = Promise.resolve();
  /** Changes wait for the load (it stats every file, so it runs off the startup path). */
  private loaded: Promise<void> = Promise.resolve();

  constructor(private readonly deps: RecentFilesDeps) {
    this.spec = { fs: deps.fs, utf8: deps.utf8, parse: deps.parse, version: 1, migrations: {}, maxBytes: RECENT_MAX_BYTES };
  }

  load(): Promise<void> {
    this.loaded = this.read();
    return this.loaded;
  }

  private async read(): Promise<void> {
    const read = await readJsonFile(this.spec, this.deps.path);
    // An invalid file is set aside, so the next write doesn't silently replace it (SR-17).
    if (read.kind === 'failed') await moveIfPresent(this.deps.fs, this.deps.path, `${this.deps.path}.invalid`);
    const stored = read.kind === 'ok' ? read.value.files : [];
    const present = await Promise.all(stored.map((file) => this.exists(file.path)));
    this.files = stored.filter((_, index) => present[index]).slice(0, RECENT_MAX);
  }

  list(): readonly RecentFile[] {
    return this.files;
  }

  add(path: string): Promise<void> {
    return this.track(async () => {
      await this.loaded;
      this.files = [{ path, openedAt: this.deps.now() }, ...this.files.filter((file) => file.path !== path)].slice(0, RECENT_MAX);
      await this.save();
    });
  }

  clear(): Promise<void> {
    return this.track(async () => {
      await this.loaded;
      this.files = [];
      await this.save();
    });
  }

  /** Settles once every change asked for so far has been written (or failed). */
  idle(): Promise<void> {
    return this.changes;
  }

  private track(change: () => Promise<void>): Promise<void> {
    const done = change();
    this.changes = Promise.all([this.changes, done.catch(() => {})]).then(() => {});
    return done;
  }

  private save(): Promise<void> {
    const write = this.writing.then(() => writeJsonFile(this.spec as JsonFileSpec<unknown>, this.deps.path, { files: this.files }));
    this.writing = write.catch(() => {});
    return write;
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await this.deps.fs.stat(path);
      return true;
    } catch {
      return false;
    }
  }
}
