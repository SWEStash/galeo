import { describe, expect, it } from 'vitest';
import { canOpenWithDefaultApp } from './open-with';

const file = { kind: 'file' as const, executable: false };
/** A file that is what it's named: no symlink in between. */
const named = (path: string) => ({ ...file, path, target: path });

describe('canOpenWithDefaultApp (SR-05)', () => {
  it('allows a plain, non-executable document', () => {
    expect(canOpenWithDefaultApp(named('/d/diagram.png'))).toBe(true);
    expect(canOpenWithDefaultApp(named('/d/report.pdf'))).toBe(true);
  });

  it.each(['/d/app.desktop', '/d/Tool.AppImage', '/d/tool.appimage', '/d/install.sh', '/d/setup.run', '/d/X.SH'])(
    'refuses the launcher %s',
    (path) => {
      expect(canOpenWithDefaultApp(named(path))).toBe(false);
    },
  );

  it.each(['/d/setup.exe', '/d/run.bat', '/d/run.cmd', '/d/x.com', '/d/x.msi', '/d/x.ps1', '/d/x.lnk', '/d/X.app', '/d/x.command'])(
    'refuses the other platforms’ launcher %s',
    (path) => {
      expect(canOpenWithDefaultApp(named(path))).toBe(false);
    },
  );

  it.each(['/d/tool.jar', '/d/start.jnlp', '/d/app.flatpakref', '/d/repo.flatpakrepo', '/d/pkg.deb', '/d/pkg.rpm', '/d/run.py', '/d/app.pyz'])('refuses %s, which installs or runs an app', (path) => {
    expect(canOpenWithDefaultApp(named(path))).toBe(false);
  });

  it('judges a symlink by the file it points to, as well as its own name', () => {
    expect(canOpenWithDefaultApp({ ...file, path: '/d/notes.md', target: '/d/run.sh' })).toBe(false);
    expect(canOpenWithDefaultApp({ ...file, path: '/d/run.sh', target: '/d/notes.md' })).toBe(false);
    expect(canOpenWithDefaultApp({ ...file, path: '/d/latest.pdf', target: '/d/reports/2026.pdf' })).toBe(true);
  });

  it('refuses files with the executable bit, whatever their name', () => {
    expect(canOpenWithDefaultApp({ kind: 'file', executable: true, path: '/d/notes.txt', target: '/d/notes.txt' })).toBe(false);
  });

  it('refuses directories and anything that is not a regular file', () => {
    expect(canOpenWithDefaultApp({ kind: 'directory', executable: false, path: '/d/folder', target: '/d/folder' })).toBe(false);
    expect(canOpenWithDefaultApp({ kind: 'other', executable: false, path: '/d/fifo', target: '/d/fifo' })).toBe(false);
  });
});
