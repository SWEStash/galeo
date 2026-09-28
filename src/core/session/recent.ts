import { readJsonFile, writeJsonFile, type JsonFileSpec, type Parse, type Utf8 } from '../settings/json-file';
import type { FileSystem } from '../ports';

/** A file the profile opened: its path and when, nothing of its content (SR-16). */
export interface RecentFile {
  path: string;
  openedAt: number;
}

const RECENT_MAX = 200;
const RECENT_MAX_BYTES = 1024 * 1024;

export interface RecentFilesDeps {
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

  constructor(private readonly deps: RecentFilesDeps) {
    this.spec = { fs: deps.fs, utf8: deps.utf8, parse: deps.parse, version: 1, migrations: {}, maxBytes: RECENT_MAX_BYTES };
  }

  async load(): Promise<void> {
    const read = await readJsonFile(this.spec, this.deps.path);
    const stored = read.kind === 'ok' ? read.value.files : [];
    const present = await Promise.all(stored.map((file) => this.exists(file.path)));
    this.files = stored.filter((_, index) => present[index]).slice(0, RECENT_MAX);
  }

  list(): readonly RecentFile[] {
    return this.files;
  }

  async add(path: string): Promise<void> {
    this.files = [{ path, openedAt: this.deps.now() }, ...this.files.filter((file) => file.path !== path)].slice(0, RECENT_MAX);
    await this.save();
  }

  async clear(): Promise<void> {
    this.files = [];
    await this.save();
  }

  private save(): Promise<void> {
    return writeJsonFile(this.spec as JsonFileSpec<unknown>, this.deps.path, { files: this.files });
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
