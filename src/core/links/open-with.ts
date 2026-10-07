import { extensionOf } from '../../shared/paths';
import type { EntryKind } from '../ports';

// Files that run or install something when "opened" (SR-05): Linux launchers, Java and Flatpak
// apps, and the other platforms' own.
const LAUNCHERS = new Set([
  '.desktop', '.appimage', '.sh', '.run', '.jar', '.jnlp', '.flatpakref', '.flatpakrepo',
  '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.lnk', '.app', '.command',
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
