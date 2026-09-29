import { folderOf, joinPath } from '../../shared/paths';
import { FsError, type FileSystem } from '../ports';
import { kindOf, type Utf8 } from '../settings/json-file';

/** The line every installed launcher carries, so galeo only ever replaces its own. */
export const LAUNCHER_MARK = '# Installed by galeo: the command-line launcher for its AppImage.';
/** The same, for the desktop entry. */
const ENTRY_MARK = 'X-galeo-Launcher=true';

export type LauncherFiles =
  | { ok: true; bin: { path: string; content: string }; desktop: { path: string; content: string } }
  | { ok: false; reason: string };

// Characters the Desktop Entry spec reserves in an Exec argument, which must then be quoted.
const RESERVED = /[\s"'\\><~|&;$*?#()`]/;

/** An Exec argument as the Desktop Entry spec writes it: quoted when needed, as a string value, `%` doubled. */
function execArgument(arg: string): string {
  const quoted = RESERVED.test(arg) ? `"${arg.replace(/["`$\\]/g, (char) => `\\${char}`)}"` : arg;
  return quoted.replace(/\\/g, '\\\\').replace(/%/g, '%%');
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * What "Install command-line launcher" writes for an AppImage (ADR-008): a copy of `galeo` pointed
 * at the AppImage, and a desktop entry that opens files with it, after `--` (SR-13).
 */
export function appImageLauncher(appImage: string, dirs: { binDir: string; applicationsDir: string }, galeoScript: string): LauncherFiles {
  if (/\p{Cc}/u.test(appImage)) return { ok: false, reason: 'the AppImage path has a control character' };
  if (!appImage.startsWith('/')) return { ok: false, reason: 'the AppImage path is not absolute' };
  const [shebang, ...rest] = galeoScript.split('\n');
  const script = rest.join('\n');
  if (!/^GALEO_BIN=.*$/m.test(script)) throw new Error('galeo has no GALEO_BIN line');
  const bin = [shebang, LAUNCHER_MARK, script.replace(/^GALEO_BIN=.*$/m, () => `GALEO_BIN=${shellQuote(appImage)}`)].join('\n');
  const exec = execArgument(appImage);
  const desktop = [
    '[Desktop Entry]',
    'Name=galeo',
    // The .deb's entry takes its Comment from package.json's description (electron-builder).
    'Comment=A fast, private desktop reader for Markdown, text and log files',
    `Exec=${exec} -- %F`,
    'Icon=galeo',
    'Type=Application',
    'Terminal=false',
    'StartupWMClass=galeo',
    'MimeType=text/markdown;text/x-markdown;text/plain;text/x-log;',
    'Categories=Utility;',
    'Actions=new-window;',
    ENTRY_MARK,
    '',
    '[Desktop Action new-window]',
    'Name=New Window',
    `Exec=${exec} --new-window`,
    '',
  ].join('\n');
  return {
    ok: true,
    bin: { path: joinPath(dirs.binDir, 'galeo'), content: bin },
    desktop: { path: joinPath(dirs.applicationsDir, 'galeo.desktop'), content: desktop },
  };
}

/**
 * Writes the launcher files: `galeo` runnable, the desktop entry readable. A `galeo` that isn't
 * galeo's stays as it is; folders that exist keep their modes.
 */
export async function installLauncher(
  deps: { fs: FileSystem; utf8: Utf8 },
  files: Extract<LauncherFiles, { ok: true }>,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { fs, utf8 } = deps;
  for (const [file, mark] of [
    [files.bin, LAUNCHER_MARK],
    [files.desktop, ENTRY_MARK],
  ] as const) {
    if (!(await ownedOrAbsent(deps, file.path, mark))) return { ok: false, reason: `${file.path} exists and is not galeo's` };
  }
  for (const [file, mode] of [
    [files.bin, 0o755],
    [files.desktop, 0o644],
  ] as const) {
    const dir = folderOf(file.path);
    if ((await kindOf(fs, dir)) !== 'directory') await fs.mkdir(dir, { mode: 0o755 });
    await fs.writeFileAtomic(file.path, utf8.encode(file.content), { mode });
  }
  return { ok: true };
}

/** Nothing is at `path`, or what is there carries galeo's `mark`. */
async function ownedOrAbsent(deps: { fs: FileSystem; utf8: Utf8 }, path: string, mark: string): Promise<boolean> {
  try {
    return deps.utf8.decode(await deps.fs.readFile(path, { maxBytes: 64 * 1024 })).includes(mark);
  } catch (error) {
    return error instanceof FsError && error.code === 'ENOENT';
  }
}
