import { joinPath } from '../../shared/paths';
import { FsError, type Clock, type FileSystem } from '../ports';

/**
 * Folders and files quick open never lists, wherever they are: version control, dependencies and
 * build output. The `quickOpenExclude` setting adds names to these.
 */
export const BUILT_IN_EXCLUDES: readonly string[] = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.cache',
];

export interface WalkOptions {
  clock: Clock;
  /** Names skipped besides the built-in ones. */
  exclude?: readonly string[];
  maxFiles?: number;
  /** How many folders deep below the root it goes. */
  maxDepth?: number;
  budgetMs?: number;
  batchSize?: number;
}

/** Why a walk ended early, if it did: a limit was reached, so the list is incomplete. */
export interface WalkEnd {
  truncated: 'files' | 'depth' | 'time' | null;
}

export const WALK_LIMITS = { maxFiles: 50_000, maxDepth: 32, budgetMs: 3_000, batchSize: 500 } as const;

/**
 * The files under `root`, as `/`-separated paths relative to it, in batches, shallow ones first.
 * Bounded by count, depth and time (SR-14). Symlinked folders are never entered, so the walk can't
 * leave the root or loop through a link; each folder is entered once by identity (bind mounts).
 * A folder it may not read is skipped; only an unreadable root fails.
 */
export async function* walk(fs: Pick<FileSystem, 'readDir' | 'stat'>, root: string, options: WalkOptions): AsyncGenerator<string[], WalkEnd> {
  const { clock, maxFiles, maxDepth, budgetMs, batchSize } = { ...WALK_LIMITS, ...options };
  const skip = new Set([...BUILT_IN_EXCLUDES, ...(options.exclude ?? [])]);
  const started = clock.now();
  const seen = new Set<string>();
  let queue: { path: string; relative: string; depth: number }[] = [{ path: root, relative: '', depth: 0 }];
  let batch: string[] = [];
  let count = 0;
  let truncated: WalkEnd['truncated'] = null;

  const enter = async (path: string): Promise<boolean> => {
    const { id } = await fs.stat(path);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  };

  await enter(root);
  while (queue.length > 0) {
    const next: typeof queue = [];
    for (const folder of queue) {
      if (clock.now() - started > budgetMs) {
        truncated = 'time';
        break;
      }
      const files: string[] = [];
      const folders: typeof queue = [];
      try {
        for await (const entry of fs.readDir(folder.path)) {
          if (skip.has(entry.name)) continue;
          const path = joinPath(folder.path === '/' ? '' : folder.path, entry.name);
          const relative = folder.relative ? `${folder.relative}/${entry.name}` : entry.name;
          if (entry.kind === 'file') files.push(relative);
          else if (entry.kind === 'symlink' && (await isFile(fs, path))) files.push(relative);
          else if (entry.kind === 'directory') folders.push({ path, relative, depth: folder.depth + 1 });
        }
      } catch (error) {
        if (!(error instanceof FsError) || folder.path === root) throw error;
        continue;
      }
      for (const file of files.sort()) {
        if (count === maxFiles) {
          truncated = 'files';
          break;
        }
        batch.push(file);
        count++;
        if (batch.length === batchSize) {
          yield batch;
          batch = [];
        }
      }
      if (truncated) break;
      for (const child of folders.sort((a, b) => a.relative.localeCompare(b.relative))) {
        if (child.depth > maxDepth) {
          truncated = 'depth';
          continue;
        }
        try {
          if (await enter(child.path)) next.push(child);
        } catch (error) {
          if (!(error instanceof FsError)) throw error;
        }
      }
    }
    if (truncated === 'time' || truncated === 'files') break;
    queue = next;
  }
  if (batch.length > 0) yield batch;
  return { truncated };
}

async function isFile(fs: Pick<FileSystem, 'stat'>, path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).kind === 'file';
  } catch (error) {
    if (error instanceof FsError) return false;
    throw error;
  }
}
