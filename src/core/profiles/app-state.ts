import type { FileSystem } from '../ports';
import { moveIfPresent, readJsonFile, writeJsonFile, type JsonFileSpec, type Parse, type Utf8 } from '../settings/json-file';
import { isProfileId } from './names';

interface AppStateFile {
  lastProfile: string | null;
}

interface AppStateDeps {
  fs: FileSystem;
  utf8: Utf8;
  /** `app-state.json` in the state directory. */
  path: string;
  parse: Parse<AppStateFile>;
}

const MAX_BYTES = 64 * 1024;

/** App-wide state (ADR-005): the profile last worked in, where launches go when no window is open. */
export class AppState {
  lastProfile: string | null = null;
  private readonly spec: JsonFileSpec<AppStateFile>;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly deps: AppStateDeps) {
    this.spec = { fs: deps.fs, utf8: deps.utf8, parse: deps.parse, version: 1, migrations: {}, maxBytes: MAX_BYTES };
  }

  async load(): Promise<void> {
    const read = await readJsonFile(this.spec, this.deps.path);
    // App-written state: an invalid file is set aside, so the next write doesn't hide it (SR-17).
    if (read.kind === 'failed') await moveIfPresent(this.deps.fs, this.deps.path, `${this.deps.path}.invalid`);
    const stored = read.kind === 'ok' ? read.value.lastProfile : null;
    this.lastProfile = stored !== null && isProfileId(stored) ? stored : null;
  }

  setLastProfile(id: string): Promise<void> {
    if (id === this.lastProfile) return this.writing;
    this.lastProfile = id;
    const write = this.writing.then(() => writeJsonFile(this.spec, this.deps.path, { lastProfile: id }));
    this.writing = write.catch(() => {});
    return write;
  }
}
