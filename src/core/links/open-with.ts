import type { EntryKind } from '../ports';

// Files that run something when "opened" (SR-05): Linux launchers, and the other platforms' own.
const LAUNCHERS = new Set([
  '.desktop', '.appimage', '.sh', '.run',
  '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.lnk', '.app', '.command',
]);

/**
 * Whether "Open with default app" may be offered for a file: a regular, non-executable file that
 * isn't a launcher type. Main still requires the user to choose it in its own native menu.
 */
export function canOpenWithDefaultApp(file: { path: string; kind: EntryKind; executable: boolean }): boolean {
  if (file.kind !== 'file' || file.executable) return false;
  const name = file.path.slice(Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\')) + 1).toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot === -1 || !LAUNCHERS.has(name.slice(dot));
}
