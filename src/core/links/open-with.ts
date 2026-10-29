import { extensionOf } from '../../shared/paths';
import type { EntryKind } from '../ports';

// Files that run or install something when "opened" (SR-05), on any system: one list, since a folder
// read on Linux may hold files from the others.
const LAUNCHERS = new Set([
  // Linux launchers and packages; Java, Python and Flatpak apps.
  '.desktop', '.appimage', '.sh', '.run', '.deb', '.rpm', '.py', '.pyz', '.jar', '.jnlp', '.flatpakref', '.flatpakrepo',
  // Windows programs, installers, scripts (Windows Script Host runs .js and .vbs), shortcuts and settings.
  '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.lnk', '.js', '.jse', '.vbs', '.vbe', '.wsf', '.wsh', '.hta', '.scr',
  '.reg', '.cpl', '.msc', '.pif', '.url', '.appref-ms',
  // macOS apps, scripts, installers and disk images.
  '.app', '.command', '.terminal', '.pkg', '.mpkg', '.scpt', '.scptd', '.workflow', '.dmg', '.webloc',
]);

/**
 * Whether "Open with default app" may be offered for a file: a regular, non-executable file that
 * isn't a launcher type, by its name or, through symlinks, by the file it points to (`target`).
 * Main still requires the user to choose it in its own native menu.
 */
export function canOpenWithDefaultApp(file: { path: string; target: string; kind: EntryKind; executable: boolean }): boolean {
  if (file.kind !== 'file' || file.executable) return false;
  return !LAUNCHERS.has(extensionOf(file.path)) && !LAUNCHERS.has(extensionOf(file.target));
}
