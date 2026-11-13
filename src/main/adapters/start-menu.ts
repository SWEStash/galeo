import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';
import type { StartMenu } from '../../core/desktop/profile-shortcuts';

/**
 * The user's Start menu programs folder on Windows (#40), through Electron's shortcut calls: profile shortcuts only,
 * written and removed on the reader's input (the handlers spend a credit first). A test names its own folder.
 */
export function windowsStartMenu(appData: string, env: Readonly<Record<string, string | undefined>>): StartMenu {
  const test = env['GALEO_TEST_START_MENU'];
  const dir = test && path.win32.isAbsolute(test) ? test : path.win32.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  return {
    dir,
    list: async () => {
      const names = await readdir(dir).catch(() => [] as string[]);
      return names.filter((name) => name.toLowerCase().endsWith('.lnk')).map((name) => path.win32.join(dir, name));
    },
    read: (file) => {
      try {
        const link = shell.readShortcutLink(file);
        return { target: link.target, args: link.args ?? '' };
      } catch {
        return null;
      }
    },
    write: (file, link) => shell.writeShortcutLink(file, 'create', link),
    remove: (file) => rm(file, { force: true }),
  };
}
