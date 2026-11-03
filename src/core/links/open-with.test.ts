import { describe, expect, it } from 'vitest';
import { canOpenWithDefaultApp } from './open-with';

const file = { kind: 'file' as const, executable: false };
/** A file that is what it's named: no symlink in between. */
const named = (path: string) => ({ ...file, path, target: path });
const onLinux = (entry: Parameters<typeof canOpenWithDefaultApp>[0]) => canOpenWithDefaultApp(entry, 'linux');

describe('canOpenWithDefaultApp on Linux (SR-05)', () => {
  it('allows a plain, non-executable document', () => {
    expect(onLinux(named('/d/diagram.png'))).toBe(true);
    expect(onLinux(named('/d/report.pdf'))).toBe(true);
  });

  it.each(['/d/app.desktop', '/d/Tool.AppImage', '/d/tool.appimage', '/d/install.sh', '/d/setup.run', '/d/X.SH'])(
    'refuses the launcher %s',
    (path) => {
      expect(onLinux(named(path))).toBe(false);
    },
  );

  it.each(['/d/setup.exe', '/d/run.bat', '/d/run.cmd', '/d/x.com', '/d/x.msi', '/d/x.ps1', '/d/x.lnk', '/d/X.app', '/d/x.command'])(
    'refuses the other platforms’ launcher %s',
    (path) => {
      expect(onLinux(named(path))).toBe(false);
    },
  );

  it.each([
    '/d/x.js', '/d/x.jse', '/d/x.vbs', '/d/x.vbe', '/d/x.wsf', '/d/x.wsh', '/d/x.hta', '/d/x.scr', '/d/x.reg', '/d/x.cpl',
    '/d/x.msc', '/d/x.pif', '/d/x.url', '/d/x.appref-ms', 'C:\\Users\\me\\Downloads\\Invoice.JS',
  ])('refuses %s, which Windows runs when it is opened', (path) => {
    expect(onLinux(named(path))).toBe(false);
  });

  it.each(['/d/x.terminal', '/d/x.pkg', '/d/x.mpkg', '/d/x.scpt', '/d/x.scptd', '/d/x.workflow', '/d/x.dmg', '/d/x.webloc'])(
    'refuses %s, which macOS runs or installs when it is opened',
    (path) => {
      expect(onLinux(named(path))).toBe(false);
    },
  );

  it.each([
    '/d/manual.chm', '/d/x.application', '/d/x.appinstaller', '/d/x.msix', '/d/x.msixbundle', '/d/x.appx', '/d/x.appxbundle',
    '/d/x.msp', '/d/x.iso', '/d/x.img', '/d/x.vhd', '/d/x.vhdx', '/d/x.rdp', '/d/x.theme', '/d/x.themepack',
    '/d/x.deskthemepack', '/d/x.scf', '/d/x.library-ms', '/d/x.search-ms', '/d/x.searchconnector-ms',
    '/d/x.settingcontent-ms', '/d/x.diagcab', '/d/x.wsc', '/d/x.sct',
  ])('refuses %s, which Windows runs, installs, mounts or connects with when it is opened', (path) => {
    expect(onLinux(named(path))).toBe(false);
  });

  it.each(['/d/x.fileloc', '/d/x.inetloc', '/d/x.mobileconfig'])(
    'refuses %s, which macOS follows or installs when it is opened',
    (path) => {
      expect(onLinux(named(path))).toBe(false);
    },
  );

  it.each(['/d/tool.jar', '/d/start.jnlp', '/d/app.flatpakref', '/d/repo.flatpakrepo', '/d/pkg.deb', '/d/pkg.rpm', '/d/run.py', '/d/app.pyz'])('refuses %s, which installs or runs an app', (path) => {
    expect(onLinux(named(path))).toBe(false);
  });

  it('judges a symlink by the file it points to, as well as its own name', () => {
    expect(onLinux({ ...file, path: '/d/notes.md', target: '/d/run.sh' })).toBe(false);
    expect(onLinux({ ...file, path: '/d/run.sh', target: '/d/notes.md' })).toBe(false);
    expect(onLinux({ ...file, path: '/d/latest.pdf', target: '/d/reports/2026.pdf' })).toBe(true);
  });

  it('refuses files with the executable bit, whatever their name', () => {
    expect(onLinux({ kind: 'file', executable: true, path: '/d/notes.txt', target: '/d/notes.txt' })).toBe(false);
  });

  it('refuses directories and anything that is not a regular file', () => {
    expect(onLinux({ kind: 'directory', executable: false, path: '/d/folder', target: '/d/folder' })).toBe(false);
    expect(onLinux({ kind: 'other', executable: false, path: '/d/fifo', target: '/d/fifo' })).toBe(false);
  });
});

describe.each(['darwin', 'win32'])('canOpenWithDefaultApp on %s: known document types only (ADR-028)', (platform) => {
  const can = (entry: Parameters<typeof canOpenWithDefaultApp>[0]) => canOpenWithDefaultApp(entry, platform);

  it.each([
    '/d/photo.JPG', '/d/diagram.png', '/d/report.pdf', '/d/plan.docx', '/d/budget.xlsx', '/d/talk.pptx', '/d/notes.odt',
    '/d/song.mp3', '/d/clip.mp4', '/d/README.md', '/d/data.csv', '/d/custom.css', '/d/settings.json', 'C:\\Users\\me\\Pictures\\a.webp',
  ])('offers it for the document %s', (path) => {
    expect(can(named(path))).toBe(true);
  });

  it.each(['/d/page.html', '/d/page.htm', '/d/icon.svg', '/d/feed.xml', '/d/a.zip', '/d/book.epub', '/d/old.doc', '/d/macro.xlsm', '/d/main.py', '/d/notes', '/d/x.newtype'])(
    'refuses %s, which is not a known document type',
    (path) => {
      expect(can(named(path))).toBe(false);
    },
  );

  it('still refuses a launcher, an executable and a symlink to a type off the list', () => {
    expect(can(named('/d/manual.chm'))).toBe(false);
    expect(can({ ...file, path: '/d/a.pdf', target: '/d/a.pdf', executable: true })).toBe(false);
    expect(can({ ...file, path: '/d/a.pdf', target: '/d/run.zip' })).toBe(false);
    expect(can({ ...file, path: '/d/latest.pdf', target: '/d/reports/2026.pdf' })).toBe(true);
  });
});

it('keeps Linux on the launcher list: a type off the macOS and Windows list is still offered there', () => {
  expect(onLinux(named('/d/a.zip'))).toBe(true);
  expect(onLinux(named('/d/page.html'))).toBe(true);
});
