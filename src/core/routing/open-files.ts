import { FsError, type FileSystem } from '../ports';
import type { TabRegistry } from '../tabs/registry';

/**
 * A launch's files in their target window (UX F1): each as a new tab in the order given, except
 * one the window already shows, which is shown instead of duplicated; the first file ends up shown.
 * They go after the shown tab, or after `after` (null: before every tab, as a drop there asks).
 * `chosen`: the reader handed these files to main directly, so each can be edited without asking (ADR-015).
 */
export function openFiles(tabs: TabRegistry, window: number, files: readonly string[], after?: string | null, { chosen = false } = {}): void {
  let first: string | undefined;
  // Where the next new tab goes: after the last one opened here, else where asked (null: first).
  let previous: string | null | undefined = after;
  for (const file of files) {
    const existing = tabs.find(file, window);
    const tab = existing ?? tabs.open(file, window, null, previous);
    if (!existing) previous = tab.id;
    if (chosen) tabs.markChosen(tab.id, window);
    first ??= tab.id;
  }
  if (first !== undefined) tabs.activate(first, window);
}

/**
 * Each file as the window's tab names it, when a tab's path differs from it only in letter case and
 * both name the same file (the same identity), as they do on macOS and Windows disks; else as given.
 * Comparing identities, not just names, keeps two files apart on a case-sensitive disk.
 */
export async function spelledAsOpen(fs: Pick<FileSystem, 'stat'>, tabs: TabRegistry, window: number, files: readonly string[]): Promise<string[]> {
  const open = tabs.list(window).filter((tab) => tab.kind !== 'settings').map((tab) => tab.path);
  return Promise.all(
    files.map(async (file) => {
      if (open.includes(file)) return file;
      const folded = file.toLowerCase();
      for (const path of open) {
        if (path.toLowerCase() === folded && (await sameFile(fs, path, file))) return path;
      }
      return file;
    }),
  );
}

async function sameFile(fs: Pick<FileSystem, 'stat'>, a: string, b: string): Promise<boolean> {
  try {
    const [first, second] = await Promise.all([fs.stat(a), fs.stat(b)]);
    return first.id === second.id;
  } catch (error) {
    if (!(error instanceof FsError)) throw error;
    return false;
  }
}
