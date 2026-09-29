import { canOpenWithDefaultApp } from '../links/open-with';
import { folderOf } from '../../shared/paths';
import type { FileSystem, OsShell } from '../ports';
import { kindOf, type Utf8 } from './json-file';

/**
 * Opens one of galeo's own config files in the user's editor (main names the path; the page
 * never does). A missing file with a `template` is created first, owner-only (SR-16). Like any
 * file handed to the desktop, it must not be something that runs (SR-05).
 */
export async function openConfigFile(deps: { fs: FileSystem; shell: OsShell; utf8: Utf8 }, path: string, template?: string): Promise<void> {
  const { fs, shell, utf8 } = deps;
  if (template !== undefined && (await kindOf(fs, path)) === null) {
    await fs.mkdir(folderOf(path), { mode: 0o700 });
    await fs.writeFileAtomic(path, utf8.encode(template), { mode: 0o600 });
  }
  const stat = await fs.stat(path);
  if (!canOpenWithDefaultApp({ path, kind: stat.kind, executable: stat.executable })) throw new Error(`not opened: ${path}`);
  await shell.openPath(path);
}
