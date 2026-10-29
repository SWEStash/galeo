import { joinPath, folderOf } from '../../shared/paths';
import { FsError, type FileSystem } from '../ports';

/**
 * The repository `dir` is in: the nearest folder, `dir` included, holding `.git` (a folder, or a
 * file in a worktree). Null outside any repository; quick open then searches `dir` itself.
 */
export async function findGitRoot(fs: Pick<FileSystem, 'stat'>, dir: string): Promise<string | null> {
  for (let current: string | null = dir; current !== null; current = parentOf(current)) {
    try {
      await fs.stat(joinPath(current, '.git'));
      return current;
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
    }
  }
  return null;
}

/** The folder above `path`: up to the root (`/`, or a Windows drive's `C:\`), then null. */
function parentOf(path: string): string | null {
  if (path === '/' || /^[a-z]:[\\/]?$/i.test(path)) return null;
  const parent = folderOf(path);
  if (/^[a-z]:$/i.test(parent)) return `${parent}\\`;
  if (parent === '') return path.startsWith('/') ? '/' : null;
  return parent;
}
