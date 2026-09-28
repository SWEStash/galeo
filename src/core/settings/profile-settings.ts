import type { Settings, SettingsNotice, SettingsOverrides } from '../../shared/settings';
import type { FileSystem, FileWatcher, Unsubscribe } from '../ports';
import { ConfigFile, type Parse, type Utf8 } from './config-file';
import { resolveSettings } from './model';

export const SETTINGS_VERSION = 1;
/** Hand-edited config is small; anything bigger is refused, not parsed (SR-17). */
export const CONFIG_MAX_BYTES = 1024 * 1024;
const DIR_MODE = 0o700;

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
  notices: SettingsNotice[] = [];

  private readonly global: ConfigFile<SettingsOverrides>;
  private readonly profile: ConfigFile<ProfileFile>;
  private readonly dirs: string[];
  private globalValue: SettingsOverrides = {};
  private profileValue: ProfileFile = {};
  private readonly fileNotices = new Map<string, SettingsNotice>();
  private readonly changeListeners: ((settings: Settings) => void)[] = [];
  private readonly noticeListeners: ((notices: SettingsNotice[]) => void)[] = [];
  private unwatch: Unsubscribe[] = [];
  private reloading: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ProfileSettingsDeps) {
    const profileDir = `${deps.configDir}/profiles/${deps.profile}`;
    this.dirs = [deps.configDir, profileDir];
    const common = { fs: deps.fs, utf8: deps.utf8, empty: {}, version: SETTINGS_VERSION, migrations: {}, maxBytes: CONFIG_MAX_BYTES };
    this.global = new ConfigFile({ ...common, path: `${deps.configDir}/settings.json`, parse: deps.parseGlobal });
    this.profile = new ConfigFile({ ...common, path: `${profileDir}/profile.json`, parse: deps.parseProfile });
  }

  onChange(listener: (settings: Settings) => void): void {
    this.changeListeners.push(listener);
  }

  onNotices(listener: (notices: SettingsNotice[]) => void): void {
    this.noticeListeners.push(listener);
  }

  async start(): Promise<void> {
    for (const dir of this.dirs) await this.deps.fs.mkdir(dir, { mode: DIR_MODE });
    await this.reload('global');
    await this.reload('profile');
    this.apply(false);
    this.unwatch = [
      this.deps.watcher.watch(`${this.deps.configDir}/settings.json`, () => this.queue('global')),
      this.deps.watcher.watch(`${this.dirs[1]}/profile.json`, () => this.queue('profile')),
    ];
  }

  stop(): void {
    for (const unwatch of this.unwatch) unwatch();
    this.unwatch = [];
  }

  private queue(file: 'global' | 'profile'): void {
    this.reloading = this.reloading.then(async () => {
      if (this.unwatch.length === 0) return;
      await this.reload(file);
      this.apply(true);
    });
  }

  private async reload(file: 'global' | 'profile'): Promise<void> {
    let notice;
    if (file === 'global') {
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

  private apply(emit: boolean): void {
    const settings = resolveSettings(this.globalValue, this.profileValue.settings ?? {});
    const notices = [...this.fileNotices.values()];
    const settingsChanged = JSON.stringify(settings) !== JSON.stringify(this.current);
    const noticesChanged = JSON.stringify(notices) !== JSON.stringify(this.notices);
    this.current = settings;
    this.notices = notices;
    if (!emit) return;
    if (settingsChanged) for (const listener of this.changeListeners) listener(settings);
    if (noticesChanged) for (const listener of this.noticeListeners) listener(notices);
  }
}
