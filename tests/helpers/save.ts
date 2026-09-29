import { renameSync, writeFileSync } from 'node:fs';

/**
 * Replaces `file` in one step, as editors and agents save: a temporary file renamed over it. A plain
 * write empties the file first, and a watcher of it may read that empty file in between.
 */
export function saveFile(file: string, content: string): void {
  writeFileSync(`${file}.new`, content);
  renameSync(`${file}.new`, file);
}
