import { renameSync, writeFileSync } from 'node:fs';

/**
 * Replaces `file` in one step, as editors and agents save: a temporary file renamed over it. A plain
 * write empties the file first, and a watcher of it may read that empty file in between.
 */
export function saveFile(file: string, content: string): void {
  writeFileSync(`${file}.new`, content);
  renameOver(`${file}.new`, file);
}

/**
 * Windows refuses a rename over a file another process has open for a moment (a virus scanner,
 * the indexer), with EPERM or EBUSY; editors there retry, and so does this, for up to ~200 ms.
 */
function renameOver(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      return renameSync(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EBUSY') || attempt === 20) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}
