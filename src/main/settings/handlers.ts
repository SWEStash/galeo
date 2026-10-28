import path from 'node:path';
import type { FileSystem, FontCatalog, OsShell } from '../../core/ports';
import type { Utf8 } from '../../core/settings/json-file';
import { settingSources } from '../../core/settings/model';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import { openConfigFile } from '../../core/settings/open-config';
import type { ProfileSettings } from '../../core/settings/profile-settings';
import type { SettingsResult, SettingsState } from '../../shared/contracts';
import type { SettingsNotice } from '../../shared/settings';
import type { Handlers } from '../ipc/register';

type SettingsChannels =
  | 'settings.get'
  | 'settings.set'
  | 'settings.reset'
  | 'settings.fonts'
  | 'settings.openCustomCss'
  | 'settings.openNoticeFile';

/** What the settings channels need of a running profile. */
interface SettingsProfile {
  id: string;
  settings: Pick<ProfileSettings, 'current' | 'notices' | 'css' | 'shared' | 'sources' | 'set' | 'reset'>;
  sessionNotice: SettingsNotice | null;
}

/** A profile's settings as the Settings tab and the documents see them. */
export function settingsState(profile: SettingsProfile): SettingsState {
  return {
    settings: profile.settings.current,
    notices: profile.settings.notices,
    session: profile.sessionNotice,
    css: profile.settings.css,
    shared: profile.settings.shared,
    sources: profile.settings.sources,
  };
}

/** A window with no profile (the sandbox choice) reads the defaults. */
const NO_PROFILE: SettingsState = {
  settings: DEFAULT_SETTINGS,
  notices: [],
  session: null,
  css: { global: '', profile: '' },
  shared: DEFAULT_SETTINGS,
  sources: settingSources({}, {}),
};

/**
 * The settings channels, on the sending window's profile. Main names every file it opens; the
 * page names only the scope or a notice by its index.
 */
export function settingsHandlers(deps: {
  profileOf: (window: number) => SettingsProfile | undefined;
  fonts: FontCatalog;
  configDir: string;
  files: { fs: FileSystem; shell: OsShell; utf8: Utf8 };
}): Pick<Handlers, SettingsChannels> {
  const { profileOf, fonts, configDir, files } = deps;
  const own = (window: number) => {
    const profile = profileOf(window);
    if (!profile) throw new Error('no profile');
    return profile;
  };
  return {
    'settings.get': (_args, event) => {
      const profile = profileOf(event.sender.id);
      return profile ? settingsState(profile) : NO_PROFILE;
    },
    'settings.set': async ([scope, change], event) => written(await own(event.sender.id).settings.set(scope, change)),
    'settings.reset': async ([key], event) => written(await own(event.sender.id).settings.reset(key)),
    // fc-list with fixed arguments, nothing from the page; any window may ask (zero network).
    'settings.fonts': () => fonts.list(),
    'settings.openCustomCss': ([scope], event) => {
      const profile = own(event.sender.id);
      const dir = scope === 'global' ? configDir : path.join(configDir, 'profiles', profile.id);
      return openConfigFile(files, path.join(dir, 'custom.css'), customCssTemplate(scope));
    },
    'settings.openNoticeFile': ([index], event) => {
      const notice = own(event.sender.id).settings.notices[index];
      if (!notice) throw new Error('no such notice');
      return openConfigFile(files, notice.path);
    },
  };
}

function written(notice: SettingsNotice | null): SettingsResult {
  return notice ? { ok: false, path: notice.path } : { ok: true };
}

/** The first text of a new `custom.css`, so the file says what it is for. */
function customCssTemplate(scope: 'global' | 'profile'): string {
  return [
    `/* galeo: CSS for documents in ${scope === 'global' ? 'every profile' : 'this profile'}.`,
    '   It applies inside documents only, after the bundled theme; saving applies it at once.',
    '   The --galeo-* variables (fonts, sizes, colours) are the stable way to restyle. */',
    '',
  ].join('\n');
}
