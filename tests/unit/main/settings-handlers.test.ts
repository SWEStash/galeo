import { describe, expect, it } from 'vitest';
import { settingSources } from '../../../src/core/settings/model';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';
import { utf8 } from '../../../src/main/adapters/utf8';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { settingsHandlers } from '../../../src/main/settings/handlers';
import type { SettingsNotice } from '../../../src/shared/settings';
import { FakeFileSystem, FakeOsShell } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;
const CONFIG = '/home/me/.config/galeo';

function setup(answer: SettingsNotice | null = null) {
  const fs = new FakeFileSystem({ [`${CONFIG}/settings.json`]: '{}' });
  const shell = new FakeOsShell();
  const changes: unknown[] = [];
  const notice: SettingsNotice = { path: `${CONFIG}/settings.json`, reason: 'invalid', detail: null };
  const profile = {
    id: 'work',
    sessionNotice: null,
    settings: {
      current: { ...DEFAULT_SETTINGS, fontSize: 18 },
      shared: DEFAULT_SETTINGS,
      sources: settingSources({}, {}),
      notices: [notice],
      css: { global: 'a {}', profile: '' },
      set: async (scope: 'global' | 'profile', change: object) => (changes.push([scope, change]), answer),
      reset: async (key: string) => (changes.push(['reset', key]), answer),
    },
  };
  const handlers = settingsHandlers({
    profileOf: (window) => (window === 1 ? profile : undefined),
    fonts: { list: async () => [{ family: 'Inter', mono: false }] },
    configDir: CONFIG,
    files: { fs, shell, utf8 },
  });
  return { handlers, fs, shell, changes };
}

describe('settingsHandlers', () => {
  it("gives the sender's profile settings, and the defaults to a window with no profile", async () => {
    const { handlers } = setup();
    expect((await handlers['settings.get']([], from(1))).settings.fontSize).toBe(18);
    expect(await handlers['settings.get']([], from(2))).toEqual({
      settings: DEFAULT_SETTINGS,
      notices: [],
      session: null,
      css: { global: '', profile: '' },
      shared: DEFAULT_SETTINGS,
      sources: settingSources({}, {}),
    });
  });

  it('writes and resets on the sender profile, and says which file refused', async () => {
    const { handlers, changes } = setup();
    expect(await handlers['settings.set'](['profile', { fontSize: 20 }], from(1))).toEqual({ ok: true });
    expect(await handlers['settings.reset'](['fontSize'], from(1))).toEqual({ ok: true });
    expect(changes).toEqual([['profile', { fontSize: 20 }], ['reset', 'fontSize']]);
    const refused = setup({ path: `${CONFIG}/settings.json`, reason: 'invalid', detail: null });
    expect(await refused.handlers['settings.set'](['global', { fontSize: 20 }], from(1))).toEqual({ ok: false, path: `${CONFIG}/settings.json` });
  });

  it('refuses writes from a window with no profile', async () => {
    const { handlers, changes } = setup();
    await expect(async () => handlers['settings.set'](['global', { fontSize: 20 }], from(2))).rejects.toThrow('no profile');
    expect(changes).toEqual([]);
  });

  // The fake file system names folders with `/`; main joins with the system's separator.
  it.runIf(process.platform !== 'win32')("creates a missing custom.css with a note of what it is for, in the scope's folder, then opens it", async () => {
    const { handlers, fs, shell } = setup();
    await handlers['settings.openCustomCss'](['profile'], from(1));
    const created = `${CONFIG}/profiles/work/custom.css`;
    expect(utf8.decode(await fs.readFile(created, { maxBytes: 4096 }))).toContain('CSS for documents in this profile');
    await handlers['settings.openCustomCss'](['global'], from(1));
    expect(shell.calls).toEqual([
      { method: 'openPath', target: created },
      { method: 'openPath', target: `${CONFIG}/custom.css` },
    ]);
  });

  it('opens a notice file by its index only', async () => {
    const { handlers, shell } = setup();
    await handlers['settings.openNoticeFile']([0], from(1));
    await expect(async () => handlers['settings.openNoticeFile']([1], from(1))).rejects.toThrow('no such notice');
    expect(shell.calls).toEqual([{ method: 'openPath', target: `${CONFIG}/settings.json` }]);
  });

  it('lists the installed fonts for any window', async () => {
    const { handlers } = setup();
    expect(await handlers['settings.fonts']([], from(2))).toEqual([{ family: 'Inter', mono: false }]);
  });
});
