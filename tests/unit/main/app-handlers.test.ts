import { describe, expect, it } from 'vitest';
import { InputCredits } from '../../../src/core/documents/input-credits';
import { appHandlers, appImagePath } from '../../../src/main/app/handlers';
import { utf8 } from '../../../src/main/adapters/utf8';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import type { AppInfo } from '../../../src/shared/contracts';
import { FakeFileSystem } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;
const GAL = ['#!/bin/sh', 'GALEO_BIN="${GALEO_BIN:-/opt/galeo/galeo}"', 'exec "$GALEO_BIN" "$@"', ''].join('\n');
const APPIMAGE = '/home/me/Apps/galeo.AppImage';

function setup({ appImage = APPIMAGE as string | null, env = {} as Record<string, string>, files = {} as Record<string, string> } = {}) {
  const fs = new FakeFileSystem({ '/opt/galeo/gal': GAL, '/opt/galeo/resources/mime.xml': '<!-- The MDX type, installed by galeo. --><mime/>', ...files });
  const input = new InputCredits(() => 0);
  const refreshed: string[] = [];
  const sandbox: string[] = [];
  let offered = true;
  const handlers = appHandlers({
    info: (window) => ({ name: 'galeo', crashLoop: window === 2 }) as unknown as AppInfo,
    sandboxChoice: { offered: () => offered, quit: () => void sandbox.push('quit'), proceed: () => void sandbox.push('proceed') },
    launcher: {
      input,
      fs,
      utf8,
      appImage,
      home: '/home/me',
      execDir: '/opt/galeo',
      resourcesDir: '/opt/galeo/resources',
      env,
      refreshMime: async (database) => void refreshed.push(database),
    },
  });
  return { handlers, fs, input, refreshed, sandbox, withdraw: () => (offered = false) };
}

// The command-line launcher is the Linux AppImage's; its folders are POSIX paths.
const posix = process.platform !== 'win32';

describe('appImagePath', () => {
  it('is the absolute APPIMAGE of a packaged run only', () => {
    expect(appImagePath(true, { APPIMAGE })).toBe(APPIMAGE);
    expect(appImagePath(false, { APPIMAGE })).toBeNull();
    expect(appImagePath(true, { APPIMAGE: 'galeo.AppImage' })).toBeNull();
    expect(appImagePath(true, {})).toBeNull();
  });
});

describe('appHandlers', () => {
  it("answers app.info for the sender's window", async () => {
    const { handlers } = setup();
    expect(await handlers['app.info']([], from(2))).toEqual({ name: 'galeo', crashLoop: true });
  });

  it.runIf(posix)('installs the launcher into ~/.local and the XDG data home, on real input only', async () => {
    const { handlers, fs, input, refreshed } = setup({ env: { XDG_DATA_HOME: '/home/me/data' } });
    await expect(async () => handlers['app.installLauncher']([], from(1))).rejects.toThrow('no input');
    input.received(1);
    expect(await handlers['app.installLauncher']([], from(1))).toEqual({ ok: true, bin: '/home/me/.local/bin/galeo' });
    expect(utf8.decode(await fs.readFile('/home/me/.local/bin/galeo', { maxBytes: 4096 }))).toContain(APPIMAGE);
    expect(await fs.stat('/home/me/data/applications/galeo.desktop')).toBeTruthy();
    expect(refreshed).toEqual(['/home/me/data/mime']);
  });

  it.runIf(posix)('ignores a relative XDG_DATA_HOME, and leaves the command to an installed package', async () => {
    const plain = setup({ env: { XDG_DATA_HOME: 'data' } });
    plain.input.received(1);
    await plain.handlers['app.installLauncher']([], from(1));
    expect(await plain.fs.stat('/home/me/.local/share/applications/galeo.desktop')).toBeTruthy();
    const packaged = setup({ env: { XDG_DATA_DIRS: 'relative:/usr/share' }, files: { '/usr/share/applications/galeo.desktop': '' } });
    packaged.input.received(1);
    expect(await packaged.handlers['app.installLauncher']([], from(1))).toEqual({ ok: false, reason: expect.stringContaining('package') });
  });

  it.runIf(posix)('uninstalls the launcher from the same folders install used, on real input only', async () => {
    const { handlers, fs, input, refreshed } = setup({ env: { XDG_DATA_HOME: '/home/me/data' } });
    input.received(1);
    await handlers['app.installLauncher']([], from(1));
    refreshed.length = 0;
    await expect(async () => handlers['app.uninstallLauncher']([], from(1))).rejects.toThrow('no input');
    input.received(1);
    expect(await handlers['app.uninstallLauncher']([], from(1))).toEqual({
      removed: ['/home/me/.local/bin/galeo', '/home/me/data/applications/galeo.desktop', '/home/me/data/mime/packages/galeo.xml'],
      kept: [],
    });
    await expect(fs.stat('/home/me/.local/bin/galeo')).rejects.toThrow(/ENOENT/);
    expect(refreshed).toEqual(['/home/me/data/mime']);
  });

  it('refuses to install or uninstall outside an AppImage', async () => {
    const { handlers, input } = setup({ appImage: null });
    input.received(1);
    await expect(async () => handlers['app.uninstallLauncher']([], from(1))).rejects.toThrow('not an AppImage');
  });

  it('refuses to install outside an AppImage', async () => {
    const { handlers, input } = setup({ appImage: null });
    input.received(1);
    await expect(async () => handlers['app.installLauncher']([], from(1))).rejects.toThrow('not an AppImage');
  });

  it('takes the sandbox choice only while it is offered', async () => {
    const { handlers, sandbox, withdraw } = setup();
    await handlers['app.resolveSandboxUnavailable'](['quit'], from(1));
    await handlers['app.resolveSandboxUnavailable'](['run-unsandboxed'], from(1));
    withdraw();
    await expect(async () => handlers['app.resolveSandboxUnavailable'](['quit'], from(1))).rejects.toThrow('not offered');
    expect(sandbox).toEqual(['quit', 'proceed']);
  });
});
