import { describe, expect, it } from 'vitest';
import {
  dockMenuModel,
  installProfileShortcut,
  isProfileShortcut,
  profileShortcut,
  profileShortcutTarget,
  renameProfileShortcut,
  startMenuFolder,
  uninstallProfileShortcuts,
  type StartMenu,
} from '../../../src/core/desktop/profile-shortcuts';

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

describe('startMenuFolder (#40)', () => {
  const appData = 'C:\\Users\\ana\\AppData\\Roaming';
  it("is the user's Start menu programs folder", () => {
    expect(startMenuFolder({ packaged: true, env: {}, appData })).toBe(programs);
  });

  it("is a test's folder only in a run from source, and only an absolute one", () => {
    const test = 'C:\\Temp\\menu';
    expect(startMenuFolder({ packaged: false, env: { GALEO_TEST_START_MENU: test }, appData })).toBe(test);
    expect(startMenuFolder({ packaged: true, env: { GALEO_TEST_START_MENU: test }, appData })).toBe(programs);
    expect(startMenuFolder({ packaged: false, env: { GALEO_TEST_START_MENU: 'menu' }, appData })).toBe(programs);
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

/** A Start menu in memory: path → the shortcut's target and arguments. */
/** A Start menu folder; `caseless` behaves as Windows' does: one file per name whatever its case, keeping its first. */
function fakeMenu(files: Record<string, { target: string; args: string }> = {}, { refuse = false, caseless = false } = {}) {
  const key = (path: string) => (caseless ? path.toLowerCase() : path);
  const store = new Map(Object.entries(files).map(([path, link]) => [key(path), { path, link }]));
  const menu: StartMenu = {
    dir: programs,
    list: async () => [...store.values()].map((file) => file.path),
    read: (path) => store.get(key(path))?.link ?? null,
    write: (path, link) => {
      if (refuse) return false;
      store.set(key(path), { path: store.get(key(path))?.path ?? path, link: { target: link.target, args: link.args } });
      return true;
    },
    remove: async (path) => void store.delete(key(path)),
  };
  return { menu, names: () => [...store.values()].map((file) => file.path.slice(programs.length + 1)).sort() };
}

describe('the Start menu operations (#40)', () => {
  const work = { id: 'work', name: 'Work' };
  const at = (name: string) => `${programs}\\${name}`;

  it('adds the shortcut, and leaves the others alone', async () => {
    const { menu, names } = fakeMenu({ [at('Firefox.lnk')]: { target: 'C:\\ff.exe', args: '' } });
    expect(await installProfileShortcut(menu, exe, work)).toEqual({ ok: true, path: at('galeo · Work.lnk') });
    expect(names()).toEqual(['Firefox.lnk', 'galeo · Work.lnk']);
  });

  it("replaces galeo's shortcut for the profile under an older name", async () => {
    const { menu, names } = fakeMenu({ [at('galeo · Old.lnk')]: { target: exe, args: '--profile work' } });
    await installProfileShortcut(menu, exe, work);
    expect(names()).toEqual(['galeo · Work.lnk']);
  });

  it('keeps a shortcut of that name that is not galeo\'s for this profile', async () => {
    const { menu, names } = fakeMenu({ [at('galeo · Work.lnk')]: { target: exe, args: '--profile home' } });
    expect(await installProfileShortcut(menu, exe, work)).toEqual({ ok: false, reason: 'the Start menu already has a shortcut called "galeo · Work"' });
    expect(names()).toEqual(['galeo · Work.lnk']);
  });

  it('keeps another program\'s shortcut whose name differs only in case, as Windows names do', async () => {
    const { menu, names } = fakeMenu({ [at('Galeo · Work.lnk')]: { target: 'C:\\Other\\galeo.exe', args: '--profile work' } }, { caseless: true });
    expect(await installProfileShortcut(menu, exe, work)).toEqual({ ok: false, reason: 'the Start menu already has a shortcut called "galeo · Work"' });
    expect(menu.read(at('Galeo · Work.lnk'))).toEqual({ target: 'C:\\Other\\galeo.exe', args: '--profile work' });
    expect(names()).toEqual(['Galeo · Work.lnk']);
  });

  it("keeps galeo's shortcut when the profile's new name differs only in case", async () => {
    const { menu, names } = fakeMenu({ [at('galeo · work.lnk')]: { target: exe, args: '--profile work' } }, { caseless: true });
    await renameProfileShortcut(menu, exe, work);
    expect(names()).toHaveLength(1);
    expect(menu.read(at('galeo · Work.lnk'))).toEqual({ target: exe, args: '--profile work' });
  });

  it('says so when Windows refuses to write it', async () => {
    const { menu } = fakeMenu({}, { refuse: true });
    expect(await installProfileShortcut(menu, exe, work)).toEqual({ ok: false, reason: "Windows didn't write the shortcut" });
  });

  it("removes only galeo's shortcuts for the profile", async () => {
    const { menu, names } = fakeMenu({
      [at('galeo · Work.lnk')]: { target: exe, args: '--profile work' },
      [at('galeo · Home.lnk')]: { target: exe, args: '--profile home' },
      [at('galeo · Mine.lnk')]: { target: 'C:\\Other\\galeo.exe', args: '--profile work' },
    });
    expect(await uninstallProfileShortcuts(menu, exe, 'work')).toEqual(['galeo · Work.lnk']);
    expect(names()).toEqual(['galeo · Home.lnk', 'galeo · Mine.lnk']);
  });

  it('renames the shortcut with the profile, and adds none where there was none', async () => {
    const { menu, names } = fakeMenu({ [at('galeo · Work.lnk')]: { target: exe, args: '--profile work' } });
    await renameProfileShortcut(menu, exe, { id: 'work', name: 'Job' });
    expect(names()).toEqual(['galeo · Job.lnk']);
    await renameProfileShortcut(menu, exe, { id: 'home', name: 'Home' });
    expect(names()).toEqual(['galeo · Job.lnk']);
  });
});
