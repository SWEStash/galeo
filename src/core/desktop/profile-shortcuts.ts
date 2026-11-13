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

/** The profiles in galeo's Dock menu on macOS (#40): a heading, then every profile, in catalog order. */
export function dockMenuModel(profiles: readonly { id: string; name: string }[]): { label: string; profile: string | null }[] {
  if (profiles.length === 0) return [];
  return [{ label: 'New window in', profile: null }, ...profiles.map((profile) => ({ label: profile.name, profile: profile.id }))];
}
