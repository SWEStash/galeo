import { joinPath } from '../../shared/paths';
import type { SettingsNotice } from '../../shared/settings';
import { FsError, type FileSystem } from '../ports';
import { ConfigFile } from '../settings/config-file';
import { kindOf, readJsonFile, type JsonFileSpec, type Parse, type Utf8 } from '../settings/json-file';
import { CONFIG_MAX_BYTES, SETTINGS_VERSION, type ProfileFile } from '../settings/profile-settings';
import { isProfileId, validateName, type NameProblem } from './names';

export const DEFAULT_PROFILE = 'default';

/** A profile as the app shows it: its id, display name and accent colour (null: the default one). */
interface Profile {
  id: string;
  name: string;
  accent: string | null;
}

interface ProfileCatalogDeps {
  fs: FileSystem;
  utf8: Utf8;
  configDir: string;
  stateDir: string;
  parse: Parse<ProfileFile>;
}

/** Why a name can't be used: see `validateName`, or another profile has it (ignoring case). */
type NameRefusal = NameProblem | 'taken';

type Created = { ok: true; profile: Profile } | { ok: false; reason: NameRefusal };
type Updated = Created | { ok: false; reason: 'invalid-file'; notice: SettingsNotice };

/**
 * The profiles on disk (ADR-005): one folder per id under `profiles/` in the config directory,
 * named in its `profile.json`. `default` always exists and can't be deleted.
 */
export class ProfileCatalog {
  private readonly spec: JsonFileSpec<ProfileFile>;

  constructor(private readonly deps: ProfileCatalogDeps) {
    this.spec = { fs: deps.fs, utf8: deps.utf8, parse: deps.parse, version: SETTINGS_VERSION, migrations: {}, maxBytes: CONFIG_MAX_BYTES };
  }

  async list(): Promise<Profile[]> {
    const ids = (await this.folders()).filter((id) => id !== DEFAULT_PROFILE);
    const profiles = await Promise.all([DEFAULT_PROFILE, ...ids].map((id) => this.read(id)));
    const [first, ...rest] = profiles;
    return [first!, ...rest.sort((a, b) => a.name.localeCompare(b.name))];
  }

  async create(id: string, name: string, accent: string | null): Promise<Created> {
    requireId(id);
    // Anything at the folder counts, a symlink included: a new profile never writes through one.
    const folder = joinPath(this.deps.configDir, 'profiles', id);
    if (id === DEFAULT_PROFILE || (await kindOf(this.deps.fs, folder)) !== null) throw new Error(`profile ${id} exists`);
    const valid = await this.usable(name, null);
    if (!valid.ok) return valid;
    // A deleted profile's session can outlive it; a new profile with its id starts afresh.
    await this.deps.fs.remove(joinPath(this.deps.stateDir, 'profiles', id));
    const value: ProfileFile = accent === null ? { name: valid.name } : { name: valid.name, accent };
    await this.file(id).update(() => value);
    return { ok: true, profile: { id, name: valid.name, accent } };
  }

  /** Renames or recolours, re-reading the file first; an invalid hand edit is left as it is (SR-17). */
  async update(id: string, change: { name?: string; accent?: string }): Promise<Updated> {
    requireId(id);
    if (id !== DEFAULT_PROFILE && !(await this.folders()).includes(id)) throw new Error(`no such profile ${id}`);
    let name: string | undefined;
    if (change.name !== undefined) {
      const valid = await this.usable(change.name, id);
      if (!valid.ok) return valid;
      name = valid.name;
    }
    const updated = await this.file(id).update((value) => ({
      ...value,
      ...(name === undefined ? {} : { name }),
      ...(change.accent === undefined ? {} : { accent: change.accent }),
    }));
    if (updated.notice) return { ok: false, reason: 'invalid-file', notice: updated.notice };
    return { ok: true, profile: toProfile(id, updated.value) };
  }

  /** Deletes the profile's settings and session. The user's documents are never touched (UX F5). */
  async delete(id: string): Promise<void> {
    requireId(id);
    if (id === DEFAULT_PROFILE) throw new Error('the default profile cannot be deleted');
    await this.deps.fs.remove(joinPath(this.deps.configDir, 'profiles', id));
    await this.deps.fs.remove(joinPath(this.deps.stateDir, 'profiles', id));
  }

  /** A valid name no other profile than `self` has. */
  private async usable(name: string, self: string | null): Promise<{ ok: true; name: string } | { ok: false; reason: NameRefusal }> {
    const valid = validateName(name);
    if (!valid.ok) return valid;
    const wanted = valid.name.toLowerCase();
    const taken = (await this.list()).some((profile) => profile.id !== self && profile.name.toLowerCase() === wanted);
    return taken ? { ok: false, reason: 'taken' } : valid;
  }

  private async read(id: string): Promise<Profile> {
    const read = await readJsonFile(this.spec, this.path(id));
    return toProfile(id, read.kind === 'ok' ? read.value : {});
  }

  /** Profile folders: real directories (not symlinks) whose names are plain ids. */
  private async folders(): Promise<string[]> {
    const ids: string[] = [];
    try {
      for await (const entry of this.deps.fs.readDir(joinPath(this.deps.configDir, 'profiles'))) {
        if (entry.kind === 'directory' && isProfileId(entry.name)) ids.push(entry.name);
      }
    } catch (error) {
      if (!(error instanceof FsError && error.code === 'ENOENT')) throw error;
    }
    return ids;
  }

  private file(id: string): ConfigFile<ProfileFile> {
    return new ConfigFile({ ...this.spec, path: this.path(id), empty: {} });
  }

  private path(id: string): string {
    return joinPath(this.deps.configDir, 'profiles', id, 'profile.json');
  }
}

function toProfile(id: string, file: ProfileFile): Profile {
  return { id, name: file.name ?? id, accent: file.accent ?? null };
}

function requireId(id: string): void {
  if (!isProfileId(id)) throw new Error('not a profile id');
}
