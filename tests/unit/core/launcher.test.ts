import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appImageLauncher, installLauncher, launcherPaths, LAUNCHER_MARK, MIME_MARK, uninstallLauncher } from '../../../src/core/desktop/launcher';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';
// The same check the packages' desktop entry passes (verify:package).
import { desktopEntryProblems } from '../../../scripts/lib/desktop-entry.mjs';

const LAUNCHER_SCRIPT = ['#!/bin/sh', 'set -eu', '', 'GALEO_BIN="${GALEO_BIN:-/opt/galeo/galeo}"', 'exec "$GALEO_BIN" "$@"', ''].join('\n');
const DIRS = {
  binDir: '/home/u/.local/bin',
  applicationsDir: '/home/u/.local/share/applications',
  iconsDir: '/home/u/.local/share/icons',
  mimeDir: '/home/u/.local/share/mime',
};
const ICON = '/home/u/.local/share/icons/hicolor/256x256/apps/galeo.png';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const MIME_XML = new TextEncoder().encode(`<?xml version="1.0"?>\n<!-- The MDX document type, ${MIME_MARK}. -->\n<mime-info/>\n`);
const MIME_FILE = '/home/u/.local/share/mime/packages/galeo.xml';

describe('appImageLauncher ("Install command-line launcher", ADR-008)', () => {
  it("points a copy of the launcher at the AppImage, marked as galeo's", () => {
    const files = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, LAUNCHER_SCRIPT);
    if (!files.ok) throw new Error(files.reason);
    expect(files.bin.path).toBe('/home/u/.local/bin/galeo');
    expect(files.bin.content).toContain("GALEO_BIN='/home/u/Apps/galeo.AppImage'");
    expect(files.bin.content).not.toContain('/opt/galeo');
    expect(files.bin.content.split('\n')[1]).toBe('# Installed by galeo: the command-line launcher for its AppImage.');
    expect(files.bin.content.endsWith('exec "$GALEO_BIN" "$@"\n')).toBe(true);
  });

  it('puts the MDX type in the user\'s MIME database', () => {
    const files = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, LAUNCHER_SCRIPT);
    if (!files.ok) throw new Error(files.reason);
    expect(files.mime).toEqual({ path: MIME_FILE, database: '/home/u/.local/share/mime' });
    expect(files.desktop.content).toMatch(/^MimeType=.*text\/mdx;/m);
  });

  it("writes a desktop entry for the AppImage that passes the packages' own check", () => {
    const files = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, LAUNCHER_SCRIPT);
    if (!files.ok) throw new Error(files.reason);
    expect(files.desktop.path).toBe('/home/u/.local/share/applications/galeo.desktop');
    expect(files.desktop.content).toContain('Exec=/home/u/Apps/galeo.AppImage -- %F\n');
    expect(files.desktop.content).toContain('Exec=/home/u/Apps/galeo.AppImage --new-window\n');
    expect(desktopEntryProblems(files.desktop.content)).toEqual([]);
  });

  it("describes galeo as the packages' entry does (package.json's description)", () => {
    const files = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, LAUNCHER_SCRIPT);
    if (!files.ok) throw new Error(files.reason);
    const { description } = JSON.parse(readFileSync('package.json', 'utf8')) as { description: string };
    expect(description).toBe('A fast, private desktop app to read and edit Markdown, text, logs, JSON, CSV and source code');
    expect(files.desktop.content).toContain(`\nComment=${description}\n`);
  });

  it('quotes a path the desktop and the shell would otherwise split or expand', () => {
    const path = String.raw`/home/u/My Apps/it's $HOME "100%" \galeo.AppImage`;
    const files = appImageLauncher(path, DIRS, LAUNCHER_SCRIPT);
    if (!files.ok) throw new Error(files.reason);
    // Desktop Entry spec: quoted, with " ` $ \ escaped, then backslashes doubled as a string value; % doubled.
    expect(files.desktop.content).toContain(String.raw`Exec="/home/u/My Apps/it's \\$HOME \\"100%%\\" \\\\galeo.AppImage" -- %F` + '\n');
    expect(files.bin.content).toContain(String.raw`GALEO_BIN='/home/u/My Apps/it'\''s $HOME "100%" \galeo.AppImage'`);
  });

  it("keeps replacement patterns in the path as they are ($& and $' are just characters)", () => {
    const files = appImageLauncher("/home/u/a$&b$'c.AppImage", DIRS, LAUNCHER_SCRIPT);
    if (!files.ok) throw new Error(files.reason);
    expect(files.bin.content).toContain(String.raw`GALEO_BIN='/home/u/a$&b$'\''c.AppImage'` + '\n');
    expect(files.bin.content.match(/GALEO_BIN=/g)).toHaveLength(1);
  });

  it('refuses a path no desktop entry can hold', () => {
    expect(appImageLauncher('/home/u/a\nb.AppImage', DIRS, LAUNCHER_SCRIPT)).toEqual({ ok: false, reason: 'the AppImage path has a control character' });
    expect(appImageLauncher('relative.AppImage', DIRS, LAUNCHER_SCRIPT)).toEqual({ ok: false, reason: 'the AppImage path is not absolute' });
  });
});

describe('installLauncher', () => {
  const files = () => {
    const made = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, LAUNCHER_SCRIPT);
    if (!made.ok) throw new Error(made.reason);
    return made;
  };
  const text = async (fs: FakeFileSystem, path: string) => new TextDecoder().decode(await fs.readFile(path, { maxBytes: 1e6 }));
  const noRefresh = async () => {};

  it('writes galeo runnable and the desktop entry readable, leaving an existing bin folder as it is', async () => {
    const fs = new FakeFileSystem({ '/home/u/.local/bin/other': '' });
    expect(await installLauncher({ fs, utf8, refreshMime: noRefresh }, files(), { icon: PNG, mime: null }, [])).toEqual({ ok: true });
    expect(await text(fs, '/home/u/.local/bin/galeo')).toContain(LAUNCHER_MARK);
    expect(fs.modeOf('/home/u/.local/bin/galeo')).toBe(0o755);
    expect(fs.modeOf('/home/u/.local/share/applications/galeo.desktop')).toBe(0o644);
    expect(fs.modeOf('/home/u/.local/bin')).toBeUndefined();
  });

  it('replaces its own earlier launcher, never a galeo command that is not its own', async () => {
    const fs = new FakeFileSystem({ '/home/u/.local/bin/galeo': `#!/bin/sh\n${LAUNCHER_MARK}\nold` });
    expect(await installLauncher({ fs, utf8, refreshMime: noRefresh }, files(), { icon: PNG, mime: null }, [])).toEqual({ ok: true });
    const foreign = new FakeFileSystem({ '/home/u/.local/bin/galeo': '#!/bin/sh\necho mine' });
    expect(await installLauncher({ fs: foreign, utf8, refreshMime: noRefresh }, files(), { icon: PNG, mime: null }, [])).toEqual({ ok: false, reason: '/home/u/.local/bin/galeo exists and is not galeo\'s' });
    expect(await text(foreign, '/home/u/.local/bin/galeo')).toBe('#!/bin/sh\necho mine');
  });

  it("never replaces a desktop entry galeo didn't write", async () => {
    const entry = '/home/u/.local/share/applications/galeo.desktop';
    const fs = new FakeFileSystem({ [entry]: '[Desktop Entry]\nName=mine\n' });
    expect(await installLauncher({ fs, utf8, refreshMime: noRefresh }, files(), { icon: PNG, mime: null }, [])).toEqual({ ok: false, reason: `${entry} exists and is not galeo's` });
    expect(await text(fs, entry)).toBe('[Desktop Entry]\nName=mine\n');
    await expect(fs.stat('/home/u/.local/bin/galeo')).rejects.toThrow(/ENOENT/);
  });

  it('installs the icon its desktop entry names, where the desktop looks for it', async () => {
    const fs = new FakeFileSystem({});
    expect(files().icon.path).toBe(ICON);
    expect(await installLauncher({ fs, utf8, refreshMime: noRefresh }, files(), { icon: PNG, mime: null }, [])).toEqual({ ok: true });
    expect(await fs.readFile(ICON, { maxBytes: 1e6 })).toEqual(PNG);
    expect(fs.modeOf(ICON)).toBe(0o644);
    // Desktops rescan an icon theme only when its folder changes, not a size folder inside it.
    expect(fs.touched).toEqual(['/home/u/.local/share/icons/hicolor']);
  });

  it('leaves an icon that is not its own as it is, and still installs the launcher', async () => {
    const fs = new FakeFileSystem({ [ICON]: 'theirs' });
    expect(await installLauncher({ fs, utf8, refreshMime: noRefresh }, files(), { icon: PNG, mime: null }, [])).toEqual({ ok: true });
    expect(await text(fs, ICON)).toBe('theirs');
    expect(fs.touched).toEqual([]);
    expect(await text(fs, '/home/u/.local/bin/galeo')).toContain(LAUNCHER_MARK);
  });

  it('installs no icon when the app has none to give', async () => {
    const fs = new FakeFileSystem({});
    expect(await installLauncher({ fs, utf8, refreshMime: noRefresh }, files(), { icon: null, mime: null }, [])).toEqual({ ok: true });
    await expect(fs.stat(ICON)).rejects.toThrow(/ENOENT/);
  });

  it('installs nothing when the galeo package already provides the command and the desktop entry', async () => {
    const deb = '/usr/share/applications/galeo.desktop';
    const fs = new FakeFileSystem({ [deb]: '[Desktop Entry]\n' });
    expect(await installLauncher({ fs, utf8, refreshMime: noRefresh }, files(), { icon: PNG, mime: null }, ['/usr/local/share/applications/galeo.desktop', deb])).toEqual({
      ok: false,
      reason: 'the galeo package is installed and already provides the galeo command',
    });
    await expect(fs.stat('/home/u/.local/bin/galeo')).rejects.toThrow(/ENOENT/);
    await expect(fs.stat('/home/u/.local/share/applications/galeo.desktop')).rejects.toThrow(/ENOENT/);
  });

  describe('the MDX type', () => {
    it('installs it readable and has the database read it again', async () => {
      const fs = new FakeFileSystem({});
      const refreshed: string[] = [];
      const refreshMime = async (database: string) => void refreshed.push(database);
      expect(await installLauncher({ fs, utf8, refreshMime }, files(), { icon: null, mime: MIME_XML }, [])).toEqual({ ok: true });
      expect(await text(fs, MIME_FILE)).toContain(MIME_MARK);
      expect(fs.modeOf(MIME_FILE)).toBe(0o644);
      expect(refreshed).toEqual(['/home/u/.local/share/mime']);
    });

    it("leaves a galeo.xml it didn't write as it is, and still installs the launcher", async () => {
      const fs = new FakeFileSystem({ [MIME_FILE]: '<mime-info/>' });
      const refreshed: string[] = [];
      const refreshMime = async (database: string) => void refreshed.push(database);
      expect(await installLauncher({ fs, utf8, refreshMime }, files(), { icon: null, mime: MIME_XML }, [])).toEqual({ ok: true });
      expect(await text(fs, MIME_FILE)).toBe('<mime-info/>');
      expect(refreshed).toEqual([]);
      expect(await text(fs, '/home/u/.local/bin/galeo')).toContain(LAUNCHER_MARK);
    });

    it('installs the launcher even when the database refuses to update', async () => {
      const fs = new FakeFileSystem({});
      const refreshMime = async () => {
        throw new Error('update-mime-database: not found');
      };
      expect(await installLauncher({ fs, utf8, refreshMime }, files(), { icon: null, mime: MIME_XML }, [])).toEqual({ ok: true });
      expect(await text(fs, MIME_FILE)).toContain(MIME_MARK);
    });
  });
});

describe('uninstallLauncher ("Uninstall command-line launcher")', () => {
  const BIN = '/home/u/.local/bin/galeo';
  const ENTRY = '/home/u/.local/share/applications/galeo.desktop';
  const installed = async () => {
    const fs = new FakeFileSystem({});
    const made = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, LAUNCHER_SCRIPT);
    if (!made.ok) throw new Error(made.reason);
    await installLauncher({ fs, utf8, refreshMime: async () => {} }, made, { icon: PNG, mime: MIME_XML }, []);
    fs.touched.length = 0;
    return fs;
  };
  const refreshing = () => {
    const refreshed: string[] = [];
    return { refreshed, refreshMime: async (database: string) => void refreshed.push(database) };
  };

  it('removes what install wrote, has the desktop rescan its icons, and the MIME database read again', async () => {
    const fs = await installed();
    const { refreshed, refreshMime } = refreshing();
    expect(launcherPaths(DIRS).bin).toBe(BIN);
    expect(await uninstallLauncher({ fs, utf8, refreshMime }, launcherPaths(DIRS), PNG)).toEqual({ removed: [BIN, ENTRY, ICON, MIME_FILE], kept: [] });
    for (const path of [BIN, ENTRY, ICON, MIME_FILE]) await expect(fs.stat(path)).rejects.toThrow(/ENOENT/);
    expect(fs.touched).toEqual(['/home/u/.local/share/icons/hicolor']);
    expect(refreshed).toEqual(['/home/u/.local/share/mime']);
  });

  it("keeps files galeo didn't write, and an icon with other bytes, and says which it kept", async () => {
    const fs = new FakeFileSystem({ [BIN]: '#!/bin/sh\necho mine', [ENTRY]: '[Desktop Entry]\nName=mine\n', [ICON]: 'theirs', [MIME_FILE]: '<mime-info/>' });
    const { refreshed, refreshMime } = refreshing();
    expect(await uninstallLauncher({ fs, utf8, refreshMime }, launcherPaths(DIRS), PNG)).toEqual({ removed: [], kept: [BIN, ENTRY, ICON, MIME_FILE] });
    expect(await fs.readFile(BIN, { maxBytes: 100 })).toEqual(new TextEncoder().encode('#!/bin/sh\necho mine'));
    expect(await fs.readFile(ICON, { maxBytes: 100 })).toEqual(new TextEncoder().encode('theirs'));
    expect(fs.touched).toEqual([]);
    expect(refreshed).toEqual([]);
  });

  it('removes nothing, and is fine, when nothing was installed', async () => {
    const { refreshed, refreshMime } = refreshing();
    expect(await uninstallLauncher({ fs: new FakeFileSystem({}), utf8, refreshMime }, launcherPaths(DIRS), PNG)).toEqual({ removed: [], kept: [] });
    expect(refreshed).toEqual([]);
  });

  it('still removes the launcher when the MIME database refuses to update', async () => {
    const fs = await installed();
    const refreshMime = async () => {
      throw new Error('update-mime-database: not found');
    };
    expect((await uninstallLauncher({ fs, utf8, refreshMime }, launcherPaths(DIRS), PNG)).removed).toContain(MIME_FILE);
  });
});
