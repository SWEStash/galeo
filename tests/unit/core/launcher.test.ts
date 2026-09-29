import { describe, expect, it } from 'vitest';
import { appImageLauncher, installLauncher, LAUNCHER_MARK } from '../../../src/core/desktop/launcher';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';
// The same check the packages' desktop entry passes (verify:package).
import { desktopEntryProblems } from '../../../scripts/lib/desktop-entry.mjs';

const GALEO = ['#!/bin/sh', 'set -eu', '', 'GALEO_BIN="${GALEO_BIN:-/opt/galeo/galeo}"', 'exec "$GALEO_BIN" "$@"', ''].join('\n');
const DIRS = { binDir: '/home/u/.local/bin', applicationsDir: '/home/u/.local/share/applications' };

describe('appImageLauncher ("Install command-line launcher", ADR-008)', () => {
  it("points a copy of galeo at the AppImage, marked as galeo's", () => {
    const files = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, GALEO);
    if (!files.ok) throw new Error(files.reason);
    expect(files.bin.path).toBe('/home/u/.local/bin/galeo');
    expect(files.bin.content).toContain("GALEO_BIN='/home/u/Apps/galeo.AppImage'");
    expect(files.bin.content).not.toContain('/opt/galeo');
    expect(files.bin.content.split('\n')[1]).toBe('# Installed by galeo: the command-line launcher for its AppImage.');
    expect(files.bin.content.endsWith('exec "$GALEO_BIN" "$@"\n')).toBe(true);
  });

  it("writes a desktop entry for the AppImage that passes the packages' own check", () => {
    const files = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, GALEO);
    if (!files.ok) throw new Error(files.reason);
    expect(files.desktop.path).toBe('/home/u/.local/share/applications/galeo.desktop');
    expect(files.desktop.content).toContain('Exec=/home/u/Apps/galeo.AppImage -- %F\n');
    expect(files.desktop.content).toContain('Exec=/home/u/Apps/galeo.AppImage --new-window\n');
    expect(desktopEntryProblems(files.desktop.content)).toEqual([]);
  });

  it('quotes a path the desktop and the shell would otherwise split or expand', () => {
    const path = String.raw`/home/u/My Apps/it's $HOME "100%" \galeo.AppImage`;
    const files = appImageLauncher(path, DIRS, GALEO);
    if (!files.ok) throw new Error(files.reason);
    // Desktop Entry spec: quoted, with " ` $ \ escaped, then backslashes doubled as a string value; % doubled.
    expect(files.desktop.content).toContain(String.raw`Exec="/home/u/My Apps/it's \\$HOME \\"100%%\\" \\\\galeo.AppImage" -- %F` + '\n');
    expect(files.bin.content).toContain(String.raw`GALEO_BIN='/home/u/My Apps/it'\''s $HOME "100%" \galeo.AppImage'`);
  });

  it('refuses a path no desktop entry can hold', () => {
    expect(appImageLauncher('/home/u/a\nb.AppImage', DIRS, GALEO)).toEqual({ ok: false, reason: 'the AppImage path has a control character' });
    expect(appImageLauncher('relative.AppImage', DIRS, GALEO)).toEqual({ ok: false, reason: 'the AppImage path is not absolute' });
  });
});

describe('installLauncher', () => {
  const files = () => {
    const made = appImageLauncher('/home/u/Apps/galeo.AppImage', DIRS, GALEO);
    if (!made.ok) throw new Error(made.reason);
    return made;
  };
  const text = async (fs: FakeFileSystem, path: string) => new TextDecoder().decode(await fs.readFile(path, { maxBytes: 1e6 }));

  it('writes galeo runnable and the desktop entry readable, leaving an existing bin folder as it is', async () => {
    const fs = new FakeFileSystem({ '/home/u/.local/bin/other': '' });
    expect(await installLauncher({ fs, utf8 }, files())).toEqual({ ok: true });
    expect(await text(fs, '/home/u/.local/bin/galeo')).toContain(LAUNCHER_MARK);
    expect(fs.modeOf('/home/u/.local/bin/galeo')).toBe(0o755);
    expect(fs.modeOf('/home/u/.local/share/applications/galeo.desktop')).toBe(0o644);
    expect(fs.modeOf('/home/u/.local/bin')).toBeUndefined();
  });

  it('replaces its own earlier launcher, never a galeo that is not galeo\'s', async () => {
    const fs = new FakeFileSystem({ '/home/u/.local/bin/galeo': `#!/bin/sh\n${LAUNCHER_MARK}\nold` });
    expect(await installLauncher({ fs, utf8 }, files())).toEqual({ ok: true });
    const foreign = new FakeFileSystem({ '/home/u/.local/bin/galeo': '#!/bin/sh\necho mine' });
    expect(await installLauncher({ fs: foreign, utf8 }, files())).toEqual({ ok: false, reason: '/home/u/.local/bin/galeo exists and is not galeo\'s' });
    expect(await text(foreign, '/home/u/.local/bin/galeo')).toBe('#!/bin/sh\necho mine');
  });
});
