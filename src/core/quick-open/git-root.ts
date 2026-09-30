import { joinPath, folderOf } from '../../shared/paths';
import { FsError, type FileSystem } from '../ports';

/**
 * The repository `dir` is in: the nearest folder, `dir` included, holding `.git` (a folder, or a
 * file in a worktree). Null outside any repository; quick open then searches `dir` itself.
 */
export async function findGitRoot(fs: Pick<FileSystem, 'stat'>, dir: string): Promise<string | null> {
  for (let current = dir; current !== ''; ) {
    try {
      await fs.stat(joinPath(current === '/' ? '' : current, '.git'));
      return current;
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
    }
    const parent = folderOf(current);
    if (parent === current || current === '/') break;
    current = parent === '' ? '/' : parent;
  }
  return null;
}
