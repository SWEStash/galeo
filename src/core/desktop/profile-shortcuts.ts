import { isProfileId } from '../profiles/names';
import type { Platform } from '../../shared/keymap';
import { joinPath } from '../../shared/paths';

type Env = Readonly<Record<string, string | undefined>>;

/** A Windows shortcut's fields, as Electron's `shell.writeShortcutLink` takes them. */
interface ShortcutLink {
  target: string;
  args: string;
  description: string;
  icon: string;
  iconIndex: number;
}

/** Characters a Windows file name can't hold (and control characters, refused before). */
const INVALID_IN_FILE_NAME = /[<>:"/\\|?*]/g;

/**
 * A profile's Start menu shortcut on Windows (#40): "galeo · <name>" beside galeo, opening galeo in that profile by
 * its id (a name could match another profile later). `target` is the galeo program this run has.
 */
export function profileShortcut(
  target: string,
  profile: { id: string; name: string },
  programsDir: string,
): { ok: true; path: string; link: ShortcutLink } | { ok: false; reason: string } {
  if (/\p{Cc}/u.test(profile.name)) return { ok: false, reason: 'a control character in the name' };
  if (!/^[A-Za-z]:\\|^\\\\/.test(target)) return { ok: false, reason: "galeo's program is not an absolute path" };
  if (!isProfileId(profile.id)) return { ok: false, reason: 'not a profile id' };
  // Windows drops trailing dots and spaces from a file name; dropping them here keeps the name galeo looks for.
  const name = `galeo · ${profile.name.replace(INVALID_IN_FILE_NAME, '-')}`.replace(/[. ]+$/, '');
  return {
    ok: true,
    path: joinPath(programsDir, `${name}.lnk`),
    link: { target, args: `--profile ${profile.id}`, description: `Opens galeo in the ${profile.name} profile`, icon: target, iconIndex: 0 },
  };
}

/** Whether a shortcut is galeo's for `id`: it runs this galeo (Windows paths ignore case) with exactly `--profile <id>`. */
export function isProfileShortcut(link: { target: string; args: string }, target: string, id: string): boolean {
  return link.target.toLowerCase() === target.toLowerCase() && link.args === `--profile ${id}`;
}

/**
 * The program a profile's shortcut runs (#40), on Windows only: the portable .exe itself (it runs from a copy
 * unpacked elsewhere), else this galeo.exe. A run from source has none, except a test naming one.
 */
export function profileShortcutTarget(run: { packaged: boolean; platform: Platform; env: Env; execPath: string }): string | null {
  if (run.platform !== 'win32') return null;
  if (!run.packaged) return run.env['GALEO_TEST_PROFILE_SHORTCUT_TARGET'] ?? null;
  return run.env['PORTABLE_EXECUTABLE_FILE'] || run.execPath;
}

/**
 * The Start menu programs folder profile shortcuts go in (#40). A run from source may name its own (an absolute
 * path) for a test; an installed galeo never takes it from its environment.
 */
export function startMenuFolder(run: { packaged: boolean; env: Env; appData: string }): string {
  const test = run.packaged ? undefined : run.env['GALEO_TEST_START_MENU'];
  if (test && /^(?:[a-zA-Z]:\\|\\\\)/.test(test)) return test;
  return `${run.appData}\\Microsoft\\Windows\\Start Menu\\Programs`;
}

/** The profiles in galeo's Dock menu on macOS (#40): a heading, then every profile, in catalog order. */
export function dockMenuModel(profiles: readonly { id: string; name: string }[]): { label: string; profile: string | null }[] {
  if (profiles.length === 0) return [];
  return [{ label: 'New window in', profile: null }, ...profiles.map((profile) => ({ label: profile.name, profile: profile.id }))];
}

/** The user's Start menu programs folder, as main reaches it: only `.lnk` files, read and written whole. */
export interface StartMenu {
  dir: string;
  /** The `.lnk` files in `dir`, as full paths. */
  list(): Promise<string[]>;
  /** A shortcut's target and arguments, or null if it can't be read. */
  read(path: string): { target: string; args: string } | null;
  /** Writes (or replaces) a shortcut; false if Windows refused. */
  write(path: string, link: ShortcutLink): boolean;
  remove(path: string): Promise<void>;
}

/** Windows file names ignore case: two names that differ only in case are one file. */
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The shortcuts in the Start menu that are galeo's for `id`. */
async function shortcutsOf(menu: StartMenu, target: string, id: string): Promise<string[]> {
  const files = (await menu.list()).filter((file) => file.slice(menu.dir.length + 1).toLowerCase().startsWith('galeo · '));
  return files.filter((file) => {
    const link = menu.read(file);
    return link !== null && isProfileShortcut(link, target, id);
  });
}

/**
 * Adds a profile's shortcut (#40), replacing galeo's shortcut for it under an older name. A shortcut of that name
 * that isn't galeo's for this profile stays: the reason says so.
 */
export async function installProfileShortcut(
  menu: StartMenu,
  target: string,
  profile: { id: string; name: string },
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const shortcut = profileShortcut(target, profile, menu.dir);
  if (!shortcut.ok) return shortcut;
  const existing = await shortcutsOf(menu, target, profile.id);
  const same = (file: string) => sameName(file, shortcut.path);
  if (!existing.some(same) && (await menu.list()).some(same)) {
    return { ok: false, reason: `the Start menu already has a shortcut called "${shortcut.path.slice(menu.dir.length + 1, -4)}"` };
  }
  if (!menu.write(shortcut.path, shortcut.link)) return { ok: false, reason: "Windows didn't write the shortcut" };
  for (const old of existing) if (!same(old)) await menu.remove(old);
  return { ok: true, path: shortcut.path };
}

/** Removes galeo's shortcuts for a profile (#40); returns the names removed. */
export async function uninstallProfileShortcuts(menu: StartMenu, target: string, id: string): Promise<string[]> {
  const found = await shortcutsOf(menu, target, id);
  for (const file of found) await menu.remove(file);
  return found.map((file) => file.slice(menu.dir.length + 1));
}

/** After a profile's rename: its shortcut, if galeo had written one, takes the new name. */
export async function renameProfileShortcut(menu: StartMenu, target: string, profile: { id: string; name: string }): Promise<void> {
  if ((await shortcutsOf(menu, target, profile.id)).length > 0) await installProfileShortcut(menu, target, profile);
}
