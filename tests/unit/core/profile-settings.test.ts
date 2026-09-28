import { describe, expect, it } from 'vitest';
import { ProfileSettings } from '../../../src/core/settings/profile-settings';
import { DEFAULT_SETTINGS } from '../../../src/core/settings/model';
import type { Parse } from '../../../src/core/settings/json-file';
import type { SettingsOverrides } from '../../../src/shared/settings';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem, FakeFileWatcher } from '../../helpers/fakes';

const GLOBAL = '/cfg/settings.json';
const PROFILE = '/cfg/profiles/default/profile.json';

const parseGlobal: Parse<SettingsOverrides> = (data) => {
  const { schemaVersion: _v, ...rest } = data as Record<string, unknown>;
  return 'fontSize' in rest && typeof rest['fontSize'] !== 'number'
    ? { ok: false, detail: 'fontSize' }
    : { ok: true, value: rest as SettingsOverrides };
};
const parseProfile: Parse<{ settings?: SettingsOverrides }> = (data) => ({
  ok: true,
  value: data as { settings?: SettingsOverrides },
});

function setup(files: Record<string, string> = {}) {
  const fs = new FakeFileSystem(files);
  const watcher = new FakeFileWatcher();
  const settings = new ProfileSettings({ fs, utf8, watcher, configDir: '/cfg', profile: 'default', parseGlobal, parseProfile });
  const changes: number[] = [];
  const notices: string[][] = [];
  settings.onChange((resolved) => changes.push(resolved.fontSize));
  settings.onNotices((list) => notices.push(list.map((notice) => notice.path)));
  return { fs, watcher, settings, changes, notices };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ProfileSettings', () => {
  it('resolves defaults, then the global file, then the profile', async () => {
    const { settings } = setup({
      [GLOBAL]: '{"fontSize":18,"measure":80}',
      [PROFILE]: '{"settings":{"fontSize":20}}',
    });
    await settings.start();
    expect(settings.current).toEqual({ ...DEFAULT_SETTINGS, fontSize: 20, measure: 80 });
  });

  it('creates the config and profile folders, owner-only, so they can be watched', async () => {
    const { fs, settings } = setup();
    await settings.start();
    expect([fs.modeOf('/cfg'), fs.modeOf('/cfg/profiles/default')]).toEqual([0o700, 0o700]);
  });

  it('applies a hand edit live and reports the change', async () => {
    const { fs, watcher, settings, changes } = setup({ [GLOBAL]: '{"fontSize":18}' });
    await settings.start();
    fs.write(GLOBAL, '{"fontSize":19}');
    watcher.emit({ path: GLOBAL, kind: 'change' });
    await flush();
    expect(settings.current.fontSize).toBe(19);
    expect(changes).toEqual([19]);
  });

  it('keeps the last valid settings and reports the file on an invalid edit, then clears it', async () => {
    const { fs, watcher, settings, changes, notices } = setup({ [GLOBAL]: '{"fontSize":18}' });
    await settings.start();
    fs.write(GLOBAL, '{"fontSize":"huge"}');
    watcher.emit({ path: GLOBAL, kind: 'change' });
    await flush();
    expect(settings.current.fontSize).toBe(18);
    expect(notices).toEqual([[GLOBAL]]);
    fs.write(GLOBAL, '{"fontSize":21}');
    watcher.emit({ path: GLOBAL, kind: 'change' });
    await flush();
    expect(notices).toEqual([[GLOBAL], []]);
    expect(changes).toEqual([21]);
  });

  it('reports a file that was invalid at start', async () => {
    const { settings } = setup({ [PROFILE]: '[' });
    await settings.start();
    expect(settings.notices.map((notice) => notice.path)).toEqual([PROFILE]);
  });

  it('stops watching', async () => {
    const { fs, watcher, settings, changes } = setup({ [GLOBAL]: '{"fontSize":18}' });
    await settings.start();
    settings.stop();
    fs.write(GLOBAL, '{"fontSize":19}');
    watcher.emit({ path: GLOBAL, kind: 'change' });
    await flush();
    expect(changes).toEqual([]);
  });
});
