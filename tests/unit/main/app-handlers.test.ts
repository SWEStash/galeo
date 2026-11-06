import { describe, expect, it } from 'vitest';
import { InputCredits } from '../../../src/core/documents/input-credits';
import { appHandlers, execCommand, launcherTarget, profileLauncherExec, type LauncherTarget } from '../../../src/main/app/handlers';
import { utf8 } from '../../../src/main/adapters/utf8';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import type { AppInfo } from '../../../src/shared/contracts';
import { FakeFileSystem } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;
const GAL = ['#!/bin/sh', 'GALEO_BIN="${GALEO_BIN:-/opt/galeo/galeo}"', 'exec "$GALEO_BIN" "$@"', ''].join('\n');
const APPIMAGE = '/home/me/Apps/galeo.AppImage';

function setup({ target = { kind: 'appimage', appImage: APPIMAGE } as LauncherTarget | null, env = {} as Record<string, string>, files = {} as Record<string, string>, profileExec = '/opt/galeo/galeo' as string | null } = {}) {
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
      target,
      home: '/home/me',
      execDir: '/opt/galeo',
      resourcesDir: '/opt/galeo/resources',
      env,
      refreshMime: async (database) => void refreshed.push(database),
      profileOf: (window) => (window === 1 ? { id: 'work', name: 'Work \\ Notes' } : null),
      profileExec: async () => profileExec,
    },
  });
  return { handlers, fs, input, refreshed, sandbox, withdraw: () => (offered = false) };
}

// The AppImage's and macOS's launchers read and write POSIX paths, which the handler joins with the
// system's own separator.
const posix = process.platform !== 'win32';

describe('launcherTarget', () => {
  const run = { packaged: true, platform: 'linux' as NodeJS.Platform, env: {}, execPath: '/opt/galeo/galeo-bin', home: '/home/me' };

  it('is the absolute APPIMAGE of a packaged Linux run only', () => {
    expect(launcherTarget({ ...run, env: { APPIMAGE } })).toEqual({ kind: 'appimage', appImage: APPIMAGE });
    expect(launcherTarget({ ...run, packaged: false, env: { APPIMAGE } })).toBeNull();
    expect(launcherTarget({ ...run, env: { APPIMAGE: 'galeo.AppImage' } })).toBeNull();
    // The .deb ships its own galeo command.
    expect(launcherTarget(run)).toBeNull();
  });

  it("is the macOS app's binary, with the command in ~/.local/bin", () => {
    const exe = '/Applications/galeo.app/Contents/MacOS/galeo';
    expect(launcherTarget({ ...run, platform: 'darwin', execPath: exe, home: '/Users/me' })).toEqual({ kind: 'app', platform: 'darwin', exe, binDir: '/Users/me/.local/bin' });
    expect(launcherTarget({ ...run, platform: 'darwin', packaged: false, execPath: exe })).toBeNull();
  });

  it('is the Windows app, with the command in WindowsApps, and the portable build the file the user has', () => {
    const windows = { ...run, platform: 'win32' as NodeJS.Platform, execPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\galeo\\galeo.exe', home: 'C:\\Users\\me' };
    const binDir = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps';
    expect(launcherTarget({ ...windows, env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' } })).toEqual({ kind: 'app', platform: 'win32', exe: windows.execPath, binDir });
    const portable = 'D:\\Tools\\galeo-0.5.0-x64-portable.exe';
    expect(
      launcherTarget({ ...windows, env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', PORTABLE_EXECUTABLE_FILE: portable, PORTABLE_EXECUTABLE_APP_FILENAME: 'galeo' } }),
    ).toMatchObject({ exe: portable });
    expect(launcherTarget({ ...windows, env: { LOCALAPPDATA: 'AppData' } })).toBeNull();
    expect(launcherTarget(windows)).toBeNull();
  });

  it("ignores another portable app's file, which an installed galeo it starts inherits", () => {
    const windows = { ...run, platform: 'win32' as NodeJS.Platform, execPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\galeo\\galeo.exe', home: 'C:\\Users\\me' };
    const env = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', PORTABLE_EXECUTABLE_FILE: 'D:\\Tools\\Terminal-portable.exe' };
    expect(launcherTarget({ ...windows, env: { ...env, PORTABLE_EXECUTABLE_APP_FILENAME: 'Terminal' } })).toMatchObject({ exe: windows.execPath });
    expect(launcherTarget({ ...windows, env })).toMatchObject({ exe: windows.execPath });
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

  it('refuses to install or uninstall when the run has no launcher', async () => {
    const { handlers, input } = setup({ target: null });
    input.received(1);
    await expect(async () => handlers['app.uninstallLauncher']([], from(1))).rejects.toThrow('no launcher for this run');
    input.received(1);
    await expect(async () => handlers['app.installLauncher']([], from(1))).rejects.toThrow('no launcher for this run');
  });

  it.runIf(posix)("installs the macOS command from the app's own gal, then uninstalls it, on real input only", async () => {
    const exe = '/Applications/galeo.app/Contents/MacOS/galeo';
    const { handlers, fs, input, refreshed } = setup({
      target: { kind: 'app', platform: 'darwin', exe, binDir: '/Users/me/.local/bin' },
      files: { '/opt/galeo/resources/gal': GAL },
    });
    await expect(async () => handlers['app.installLauncher']([], from(1))).rejects.toThrow('no input');
    input.received(1);
    expect(await handlers['app.installLauncher']([], from(1))).toEqual({ ok: true, bin: '/Users/me/.local/bin/galeo' });
    expect(utf8.decode(await fs.readFile('/Users/me/.local/bin/galeo', { maxBytes: 4096 }))).toContain(`GALEO_BIN='${exe}'`);
    input.received(1);
    expect(await handlers['app.uninstallLauncher']([], from(1))).toEqual({ removed: ['/Users/me/.local/bin/galeo'], kept: [] });
    expect(refreshed).toEqual([]);
  });

  it('installs and uninstalls the Windows galeo.cmd in WindowsApps', async () => {
    const binDir = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps';
    const { handlers, fs, input } = setup({ target: { kind: 'app', platform: 'win32', exe: 'C:\\Programs\\galeo\\galeo.exe', binDir } });
    input.received(1);
    expect(await handlers['app.installLauncher']([], from(1))).toEqual({ ok: true, bin: `${binDir}\\galeo.cmd` });
    expect(utf8.decode(await fs.readFile(`${binDir}\\galeo.cmd`, { maxBytes: 4096 }))).toContain('"C:\\Programs\\galeo\\galeo.exe" --galeo-command -- %*');
    input.received(1);
    expect(await handlers['app.uninstallLauncher']([], from(1))).toEqual({ removed: [`${binDir}\\galeo.cmd`], kept: [] });
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

describe('profile launchers (#60)', () => {
  const ENTRY = '/home/me/.local/share/applications/galeo-profile-work.desktop';
  const read = async (fs: FakeFileSystem, file: string) => utf8.decode(await fs.readFile(file, { maxBytes: 1e5 }));

  it.runIf(posix)("installs the sender profile's entry, opening galeo in that profile by id, and removes only it", async () => {
    const { handlers, fs, input } = setup();
    input.received(1);
    expect(await handlers['app.installProfileLauncher']([], from(1))).toEqual({ ok: true, path: ENTRY });
    const entry = await read(fs, ENTRY);
    expect(entry).toContain('Name=galeo — Work \\\\ Notes\n');
    expect(entry).toContain('Exec=/opt/galeo/galeo --profile work -- %F\n');
    expect(entry).toContain('Exec=/opt/galeo/galeo --profile work --new-window\n');
    expect(entry).toContain('X-galeo-Profile=work');
    expect(fs.modeOf(ENTRY)).toBe(0o644);
    input.received(1);
    expect(await handlers['app.uninstallProfileLauncher']([], from(1))).toEqual({ removed: [ENTRY], kept: [] });
  });

  it.runIf(posix)('keeps an entry galeo did not write, or another profile\'s', async () => {
    const { handlers, input } = setup({ files: { [ENTRY]: '[Desktop Entry]\nX-galeo-Profile=home\n' } });
    input.received(1);
    expect(await handlers['app.installProfileLauncher']([], from(1))).toEqual({ ok: false, reason: `${ENTRY} exists and is not galeo's` });
    input.received(1);
    expect(await handlers['app.uninstallProfileLauncher']([], from(1))).toEqual({ removed: [], kept: [ENTRY] });
  });

  it('needs real input, and says why when this run has no command to launch', async () => {
    const { handlers, input } = setup({ profileExec: null });
    await expect(handlers['app.installProfileLauncher']([], from(1))).rejects.toThrow('no input');
    await expect(handlers['app.uninstallProfileLauncher']([], from(1))).rejects.toThrow('no input');
    input.received(1);
    expect(await handlers['app.installProfileLauncher']([], from(1))).toMatchObject({ ok: false, reason: expect.stringContaining('no command') });
  });
});

describe('profileLauncherExec', () => {
  const fs = new FakeFileSystem({ '/usr/share/applications/galeo.desktop': '[Desktop Entry]\nName=galeo\nExec=/opt/galeo/galeo -- %F\n' });
  const run = { packaged: true, platform: 'linux' as NodeJS.Platform, env: {}, fs, utf8 };

  // Linux only, with POSIX paths throughout.
  it.runIf(posix)("is the AppImage, else the package entry's command, else a test's, on Linux only", async () => {
    expect(await profileLauncherExec({ ...run, env: { APPIMAGE } })).toBe(APPIMAGE);
    expect(await profileLauncherExec(run)).toBe('/opt/galeo/galeo');
    expect(await profileLauncherExec({ ...run, packaged: false })).toBeNull();
    expect(await profileLauncherExec({ ...run, packaged: false, env: { GALEO_TEST_PROFILE_LAUNCHER_EXEC: '/tmp/galeo' } })).toBe('/tmp/galeo');
    expect(await profileLauncherExec({ ...run, platform: 'darwin' })).toBeNull();
    expect(await profileLauncherExec({ ...run, fs: new FakeFileSystem({}) })).toBeNull();
  });

  it('reads a quoted command', () => {
    expect(execCommand('[Desktop Entry]\nExec="/opt/my apps/galeo" -- %F\n')).toBe('/opt/my apps/galeo');
    expect(execCommand('[Desktop Entry]\nName=x\n')).toBeNull();
  });
});
