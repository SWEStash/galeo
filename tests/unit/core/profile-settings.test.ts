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
  it('refuses a profile that is not a plain id, so no path leaves profiles/', () => {
    for (const profile of ['../x', 'a/b', '']) {
      expect(
        () => new ProfileSettings({ fs: new FakeFileSystem(), utf8, watcher: new FakeFileWatcher(), configDir: '/cfg', profile, parseGlobal, parseProfile }),
      ).toThrow(/profile id/);
    }
  });

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

  describe('custom CSS (ADR-005: global, then the profile, applied live)', () => {
    const GLOBAL_CSS = '/cfg/custom.css';
    const PROFILE_CSS = '/cfg/profiles/default/custom.css';

    it('reads both files, empty when missing', async () => {
      const { settings } = setup({ [GLOBAL_CSS]: 'p { color: red }' });
      await settings.start();
      expect(settings.css).toEqual({ global: 'p { color: red }', profile: '' });
    });

    it('applies a hand edit of either file live', async () => {
      const { fs, watcher, settings } = setup();
      const css: { global: string; profile: string }[] = [];
      settings.onCss((next) => css.push(next));
      await settings.start();
      fs.write(PROFILE_CSS, 'h1 { color: blue }');
      watcher.emit({ path: PROFILE_CSS, kind: 'change' });
      await flush();
      expect(css).toEqual([{ global: '', profile: 'h1 { color: blue }' }]);
    });

    it('keeps the last good CSS and names the file when one is too large or not UTF-8', async () => {
      const { fs, watcher, settings, notices } = setup({ [GLOBAL_CSS]: 'p {}' });
      await settings.start();
      fs.write(GLOBAL_CSS, 'x'.repeat(1024 * 1024 + 1));
      watcher.emit({ path: GLOBAL_CSS, kind: 'change' });
      await flush();
      expect(settings.css.global).toBe('p {}');
      expect(settings.notices).toEqual([{ path: GLOBAL_CSS, reason: 'too-large', detail: expect.any(String) }]);
      fs.write(GLOBAL_CSS, new Uint8Array([0x70, 0xff, 0xfe]));
      watcher.emit({ path: GLOBAL_CSS, kind: 'change' });
      await flush();
      expect(settings.css.global).toBe('p {}');
      expect(settings.notices[0]).toMatchObject({ path: GLOBAL_CSS, reason: 'invalid' });
      fs.write(GLOBAL_CSS, 'p { margin: 0 }');
      watcher.emit({ path: GLOBAL_CSS, kind: 'change' });
      await flush();
      expect(settings.css.global).toBe('p { margin: 0 }');
      expect(notices.at(-1)).toEqual([]);
    });
  });

  it("reports a hand edit of the profile's name or accent", async () => {
    const { fs, watcher, settings } = setup({ [PROFILE]: '{"name":"Acme"}' });
    const seen: { name?: string; accent?: string }[] = [];
    settings.onIdentity((identity) => seen.push(identity));
    await settings.start();
    expect(settings.identity).toEqual({ name: 'Acme' });
    fs.write(PROFILE, '{"name":"Acme EU","accent":"#2f9e44","settings":{"fontSize":20}}');
    watcher.emit({ path: PROFILE, kind: 'change' });
    await flush();
    fs.write(PROFILE, '{"name":"Acme EU","accent":"#2f9e44","settings":{"fontSize":21}}');
    watcher.emit({ path: PROFILE, kind: 'change' });
    await flush();
    expect(seen).toEqual([{ name: 'Acme EU', accent: '#2f9e44' }]);
  });
});
