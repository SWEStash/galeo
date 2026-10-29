import path from 'node:path';
import type { DropGrants } from '../../core/documents/drops';
import type { FileSystem } from '../../core/ports';
import type { Handlers } from '../ipc/register';

/**
 * Drag and drop from the file manager (UX F3, SR-12). The preload registers the paths of a real
 * drop; the page gets a token and a count, and says where the files landed. Files open as tabs
 * there (unsupported ones in their "can't display" state); a folder opens quick open on it.
 */
export function dropHandlers(deps: {
  drops: DropGrants;
  fs: Pick<FileSystem, 'stat'>;
  /** Tells the window it has a drop to place. */
  received: (window: number, drop: { token: string; count: number }) => void;
  open: (window: number, files: readonly string[], after: string | null | undefined) => Promise<void>;
  /** Quick open's next search in the window is this folder. */
  searchFolder: (window: number, folder: string) => void;
}): Pick<Handlers, 'drops.register' | 'drops.open'> {
  const { drops, fs, received, open, searchFolder } = deps;
  return {
    'drops.register': ([paths], event) => {
      const absolute = paths.filter((each) => path.isAbsolute(each));
      if (absolute.length === 0) return;
      received(event.sender.id, { token: drops.grant(event.sender.id, absolute), count: absolute.length });
    },
    'drops.open': async ([token, target], event) => {
      const window = event.sender.id;
      const paths = drops.take(window, token);
      if (!paths) throw new Error('not dropped here');
      const files: string[] = [];
      const folders: string[] = [];
      for (const each of paths) {
        const kind = await fs.stat(each).then((stat) => stat.kind, () => null);
        (kind === 'directory' ? folders : files).push(each);
      }
      if (files.length > 0) await open(window, files, target.after);
      if (folders.length > 0) searchFolder(window, folders[0]!);
      return { folder: folders.length > 0 };
    },
  };
}
