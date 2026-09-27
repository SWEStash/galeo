import { describe, expect, it } from 'vitest';
import { canOpenWithDefaultApp } from './open-with';

const file = { kind: 'file' as const, executable: false };

describe('canOpenWithDefaultApp (SR-05)', () => {
  it('allows a plain, non-executable document', () => {
    expect(canOpenWithDefaultApp({ ...file, path: '/d/diagram.png' })).toBe(true);
    expect(canOpenWithDefaultApp({ ...file, path: '/d/report.pdf' })).toBe(true);
  });

  it.each(['/d/app.desktop', '/d/Tool.AppImage', '/d/tool.appimage', '/d/install.sh', '/d/setup.run', '/d/X.SH'])(
    'refuses the launcher %s',
    (path) => {
      expect(canOpenWithDefaultApp({ ...file, path })).toBe(false);
    },
  );

  it.each(['/d/setup.exe', '/d/run.bat', '/d/run.cmd', '/d/x.com', '/d/x.msi', '/d/x.ps1', '/d/x.lnk', '/d/X.app', '/d/x.command'])(
    'refuses the other platforms’ launcher %s',
    (path) => {
      expect(canOpenWithDefaultApp({ ...file, path })).toBe(false);
    },
  );

  it('refuses files with the executable bit, whatever their name', () => {
    expect(canOpenWithDefaultApp({ kind: 'file', executable: true, path: '/d/notes.txt' })).toBe(false);
  });

  it('refuses directories and anything that is not a regular file', () => {
    expect(canOpenWithDefaultApp({ kind: 'directory', executable: false, path: '/d/folder' })).toBe(false);
    expect(canOpenWithDefaultApp({ kind: 'other', executable: false, path: '/d/fifo' })).toBe(false);
  });
});
