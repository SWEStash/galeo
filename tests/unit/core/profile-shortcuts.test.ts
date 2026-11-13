import { describe, expect, it } from 'vitest';
import { dockMenuModel, isProfileShortcut, profileShortcut, profileShortcutTarget } from '../../../src/core/desktop/profile-shortcuts';

const programs = 'C:\\Users\\ana\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs';
const exe = 'C:\\Users\\ana\\AppData\\Local\\Programs\\galeo\\galeo.exe';

describe('profileShortcut (#40, Windows)', () => {
  it('names the shortcut "galeo · <name>" beside galeo, and opens galeo in the profile by its id', () => {
    expect(profileShortcut(exe, { id: 'work', name: 'Work' }, programs)).toEqual({
      ok: true,
      path: `${programs}\\galeo · Work.lnk`,
      link: { target: exe, args: '--profile work', description: 'Opens galeo in the Work profile', icon: exe, iconIndex: 0 },
    });
  });

  it('replaces the characters a Windows file name cannot hold, and trailing dots and spaces', () => {
    const name = (profile: string) => {
      const shortcut = profileShortcut(exe, { id: 'p', name: profile }, programs);
      return shortcut.ok ? shortcut.path.slice(programs.length + 1) : shortcut.reason;
    };
    expect(name('A/B: "c" <d> |e|? *f*\\')).toBe('galeo · A-B- -c- -d- -e-- -f--.lnk');
    expect(name('Notes. ')).toBe('galeo · Notes.lnk');
  });

  it('refuses a control character, a relative target or a foreign id', () => {
    expect(profileShortcut(exe, { id: 'p', name: 'a\u0007b' }, programs)).toEqual({ ok: false, reason: 'a control character in the name' });
    expect(profileShortcut('galeo.exe', { id: 'p', name: 'P' }, programs)).toEqual({ ok: false, reason: "galeo's program is not an absolute path" });
    expect(profileShortcut(exe, { id: '../x', name: 'P' }, programs)).toEqual({ ok: false, reason: 'not a profile id' });
  });

  it("tells galeo's shortcut for a profile from any other", () => {
    const link = { target: exe, args: '--profile work' };
    expect(isProfileShortcut(link, exe, 'work')).toBe(true);
    expect(isProfileShortcut({ ...link, target: exe.toUpperCase() }, exe, 'work')).toBe(true);
    expect(isProfileShortcut(link, exe, 'home')).toBe(false);
    expect(isProfileShortcut({ ...link, args: '--profile work --new-window' }, exe, 'work')).toBe(false);
    expect(isProfileShortcut({ ...link, target: 'C:\\Other\\galeo.exe' }, exe, 'work')).toBe(false);
  });
});

describe('profileShortcutTarget (#40)', () => {
  const env = {};
  it('is the installed galeo.exe on Windows', () => {
    expect(profileShortcutTarget({ packaged: true, platform: 'win32', env, execPath: exe })).toBe(exe);
  });

  it('is the portable .exe itself, not the copy it runs from', () => {
    const portable = 'D:\\Tools\\galeo-0.9.0-x64-portable.exe';
    expect(profileShortcutTarget({ packaged: true, platform: 'win32', env: { PORTABLE_EXECUTABLE_FILE: portable }, execPath: exe })).toBe(portable);
  });

  it('is none for a run from source, unless a test names one, and none off Windows', () => {
    expect(profileShortcutTarget({ packaged: false, platform: 'win32', env, execPath: exe })).toBeNull();
    expect(profileShortcutTarget({ packaged: false, platform: 'win32', env: { GALEO_TEST_PROFILE_SHORTCUT_TARGET: exe }, execPath: 'x' })).toBe(exe);
    expect(profileShortcutTarget({ packaged: true, platform: 'linux', env, execPath: '/opt/galeo/galeo-bin' })).toBeNull();
  });
});

describe('dockMenuModel (#40, macOS)', () => {
  it('lists every profile under a heading, in catalog order', () => {
    expect(dockMenuModel([{ id: 'default', name: 'Default' }, { id: 'work', name: 'Work' }])).toEqual([
      { label: 'New window in', profile: null },
      { label: 'Default', profile: 'default' },
      { label: 'Work', profile: 'work' },
    ]);
  });

  it('has no heading without profiles', () => {
    expect(dockMenuModel([])).toEqual([]);
  });
});
