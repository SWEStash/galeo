import { joinPath } from '../../shared/paths';
import type { Settings, SettingsNotice, SettingsOverrides } from '../../shared/settings';
import { FsError, type FileSystem, type FileWatcher, type Unsubscribe } from '../ports';
import { isProfileId } from '../profiles/names';
import { ConfigFile } from './config-file';
import type { Parse, Utf8 } from './json-file';
import { resolveSettings, settingSources } from './model';

export const SETTINGS_VERSION = 1;
/** Hand-edited config is small; anything bigger is refused, not parsed (SR-17). */
export const CONFIG_MAX_BYTES = 1024 * 1024;
const DIR_MODE = 0o700;

type File = 'global' | 'profile' | 'global-css' | 'profile-css';

/** The user's CSS for documents (ADR-005): the global file, then the profile's. */
export interface CustomCss {
  global: string;
  profile: string;
}

/** The profile's own name and accent colour, as `profile.json` says. */
export interface ProfileIdentity {
  name?: string;
  accent?: string;
}

/** `profile.json`: the profile's display name, accent colour and setting overrides. */
export interface ProfileFile {
  name?: string;
  accent?: string;
  settings?: SettingsOverrides;
}

export interface ProfileSettingsDeps {
  fs: FileSystem;
  utf8: Utf8;
  watcher: FileWatcher;
  configDir: string;
  profile: string;
  parseGlobal: Parse<SettingsOverrides>;
  parseProfile: Parse<ProfileFile>;
}

/**
 * One profile's settings: defaults, then `settings.json`, then the profile's `profile.json`
 * (ADR-005). Both files are watched, so hand edits apply live; an invalid one keeps its last
 * valid value and is reported until it's fixed.
 */
export class ProfileSettings {
  current: Settings = resolveSettings({}, {});
  /** Defaults, then `settings.json`: what every profile gets unless it overrides it. */
  shared: Settings = resolveSettings({}, {});
  sources = settingSources({}, {});
  notices: SettingsNotice[] = [];
  css: CustomCss = { global: '', profile: '' };
  identity: ProfileIdentity = {};

  private readonly global: ConfigFile<SettingsOverrides>;
  private readonly profile: ConfigFile<ProfileFile>;
  private readonly dirs: string[];
  private globalValue: SettingsOverrides = {};
  private profileValue: ProfileFile = {};
  private readonly fileNotices = new Map<string, SettingsNotice>();
  private readonly changeListeners: ((settings: Settings) => void)[] = [];
  private readonly noticeListeners: ((notices: SettingsNotice[]) => void)[] = [];
  private readonly cssListeners: ((css: CustomCss) => void)[] = [];
  private readonly identityListeners: ((identity: ProfileIdentity) => void)[] = [];
  private readonly paths: Record<File, string>;
  private cssValue: CustomCss = { global: '', profile: '' };
  private unwatch: Unsubscribe[] = [];
  private reloading: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ProfileSettingsDeps) {
    if (!isProfileId(deps.profile)) throw new Error(`not a profile id: ${JSON.stringify(deps.profile)}`);
    const profileDir = joinPath(deps.configDir, 'profiles', deps.profile);
    this.dirs = [deps.configDir, profileDir];
    const common = { fs: deps.fs, utf8: deps.utf8, empty: {}, version: SETTINGS_VERSION, migrations: {}, maxBytes: CONFIG_MAX_BYTES };
    this.paths = {
      global: joinPath(deps.configDir, 'settings.json'),
      profile: joinPath(profileDir, 'profile.json'),
      'global-css': joinPath(deps.configDir, 'custom.css'),
      'profile-css': joinPath(profileDir, 'custom.css'),
    };
    this.global = new ConfigFile({ ...common, path: this.paths.global, parse: deps.parseGlobal });
    this.profile = new ConfigFile({ ...common, path: this.paths.profile, parse: deps.parseProfile });
  }

  /**
   * A change made in the Settings tab, to this profile or to all of them. The file is read again
   * right before writing, and never written while a hand edit left it invalid: its notice says so.
   */
  async set(scope: 'global' | 'profile', change: SettingsOverrides): Promise<SettingsNotice | null> {
    const written =
      scope === 'global'
        ? await this.global.update((value) => ({ ...value, ...change }))
        : await this.profile.update((value) => ({ ...value, settings: { ...value.settings, ...change } }));
    return this.written(scope, written.notice);
  }

  /** Drops this profile's own value, so it uses the one all profiles have. */
  async reset(key: keyof Settings): Promise<SettingsNotice | null> {
    const written = await this.profile.update((value) => {
      const { [key]: _dropped, ...rest } = value.settings ?? {};
      return { ...value, settings: rest };
    });
    return this.written('profile', written.notice);
  }

  private written(scope: 'global' | 'profile', notice: SettingsNotice | null): Promise<SettingsNotice | null> {
    const done = this.reloading.then(async () => {
      if (!notice) await this.reload(scope);
      this.apply(true);
      return notice;
    });
    this.reloading = done.then(() => {});
    return done;
  }

  onCss(listener: (css: CustomCss) => void): void {
    this.cssListeners.push(listener);
  }

  onIdentity(listener: (identity: ProfileIdentity) => void): void {
    this.identityListeners.push(listener);
  }

  onChange(listener: (settings: Settings) => void): void {
    this.changeListeners.push(listener);
  }

  onNotices(listener: (notices: SettingsNotice[]) => void): void {
    this.noticeListeners.push(listener);
  }

  async start(): Promise<void> {
    for (const dir of this.dirs) await this.deps.fs.mkdir(dir, { mode: DIR_MODE });
    const files: File[] = ['global', 'profile', 'global-css', 'profile-css'];
    for (const file of files) await this.reload(file);
    this.apply(false);
    this.unwatch = files.map((file) => this.deps.watcher.watch(this.paths[file], () => this.queue(file)));
  }

  stop(): void {
    for (const unwatch of this.unwatch) unwatch();
    this.unwatch = [];
  }

  private queue(file: File): void {
    this.reloading = this.reloading.then(async () => {
      if (this.unwatch.length === 0) return;
      await this.reload(file);
      this.apply(true);
    });
  }

  private async reload(file: File): Promise<void> {
    let notice;
    if (file === 'global-css' || file === 'profile-css') {
      notice = await this.reloadCss(file);
    } else if (file === 'global') {
      const loaded = await this.global.load();
      this.globalValue = loaded.value;
      notice = loaded.notice;
    } else {
      const loaded = await this.profile.load();
      this.profileValue = loaded.value;
      notice = loaded.notice;
    }
    this.fileNotices.delete(file);
    if (notice) this.fileNotices.set(file, notice);
  }

  /** A CSS file that is too large or not UTF-8 is left as it is, and its last good text stays (SR-17). */
  private async reloadCss(file: 'global-css' | 'profile-css'): Promise<SettingsNotice | null> {
    const key = file === 'global-css' ? 'global' : 'profile';
    const path = this.paths[file];
    try {
      this.cssValue = { ...this.cssValue, [key]: this.deps.utf8.decode(await this.deps.fs.readFile(path, { maxBytes: CONFIG_MAX_BYTES })) };
      return null;
    } catch (error) {
      if (error instanceof FsError && error.code === 'ENOENT') {
        this.cssValue = { ...this.cssValue, [key]: '' };
        return null;
      }
      if (error instanceof FsError && error.code === 'ETOOBIG') return { path, reason: 'too-large', detail: `larger than ${CONFIG_MAX_BYTES} bytes` };
      if (error instanceof FsError) return { path, reason: 'unreadable', detail: error.code };
      return { path, reason: 'invalid', detail: 'not UTF-8' };
    }
  }

  private apply(emit: boolean): void {
    const settings = resolveSettings(this.globalValue, this.profileValue.settings ?? {});
    this.shared = resolveSettings(this.globalValue, {});
    this.sources = settingSources(this.globalValue, this.profileValue.settings ?? {});
    const notices = [...this.fileNotices.values()];
    const { name, accent } = this.profileValue;
    const identity: ProfileIdentity = { ...(name === undefined ? {} : { name }), ...(accent === undefined ? {} : { accent }) };
    const settingsChanged = JSON.stringify(settings) !== JSON.stringify(this.current);
    const noticesChanged = JSON.stringify(notices) !== JSON.stringify(this.notices);
    const cssChanged = JSON.stringify(this.cssValue) !== JSON.stringify(this.css);
    const identityChanged = JSON.stringify(identity) !== JSON.stringify(this.identity);
    this.current = settings;
    this.notices = notices;
    this.css = this.cssValue;
    this.identity = identity;
    if (!emit) return;
    if (settingsChanged) for (const listener of this.changeListeners) listener(settings);
    if (noticesChanged) for (const listener of this.noticeListeners) listener(notices);
    if (cssChanged) for (const listener of this.cssListeners) listener(this.css);
    if (identityChanged) for (const listener of this.identityListeners) listener(identity);
  }
}

