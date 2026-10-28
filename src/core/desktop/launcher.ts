import { folderOf, joinPath } from '../../shared/paths';
import type { FileSystem } from '../ports';
import { kindOf, type Utf8 } from '../settings/json-file';

/** The line every installed launcher carries, so galeo only ever replaces its own. */
export const LAUNCHER_MARK = '# Installed by galeo: the command-line launcher for its AppImage.';
/** The same, for the desktop entry. */
const ENTRY_MARK = 'X-galeo-Launcher=true';
/** The same, for the MDX type (`packaging/linux/galeo-mime.xml` carries it in a comment). */
export const MIME_MARK = 'installed by galeo';

/** The types of the files galeo reads; the package check (`scripts/lib/desktop-entry.mjs`) holds the list this must match. */
const MIME_TYPES = [
  'text/markdown', 'text/x-markdown', 'text/mdx', 'text/plain', 'text/x-log',
  'application/json', 'application/yaml', 'application/toml', 'text/csv', 'text/tab-separated-values',
  'text/javascript', 'text/x-python', 'text/x-python3', 'text/rust', 'text/x-go', 'application/x-shellscript',
  'text/x-csrc', 'text/x-chdr', 'text/x-c++src', 'text/x-c++hdr', 'text/x-csharp', 'text/x-java', 'text/x-kotlin',
  'application/x-ruby', 'application/x-php', 'text/x-lua', 'application/x-perl', 'application/sql', 'text/css', 'text/x-scss',
  'application/xml', 'text/x-patch', 'text/x-makefile',
];

type LauncherDirs = { binDir: string; applicationsDir: string; iconsDir: string; mimeDir: string };

interface LauncherPaths {
  bin: string;
  desktop: string;
  icon: { path: string; theme: string };
  /** The MDX type's file in the user's MIME database, and the database to update after it. */
  mime: { path: string; database: string };
}

type LauncherFiles =
  | {
      ok: true;
      bin: { path: string; content: string };
      desktop: { path: string; content: string };
      icon: LauncherPaths['icon'];
      mime: LauncherPaths['mime'];
    }
  | { ok: false; reason: string };

/** Where the launcher's files go, in the user's own folders. */
export function launcherPaths(dirs: LauncherDirs): LauncherPaths {
  return {
    bin: joinPath(dirs.binDir, 'galeo'),
    desktop: joinPath(dirs.applicationsDir, 'galeo.desktop'),
    icon: { path: joinPath(dirs.iconsDir, 'hicolor', '256x256', 'apps', 'galeo.png'), theme: joinPath(dirs.iconsDir, 'hicolor') },
    mime: { path: joinPath(dirs.mimeDir, 'packages', 'galeo.xml'), database: dirs.mimeDir },
  };
}

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
 * What "Install command-line launcher" writes for an AppImage (ADR-008): a copy of `gal`, installed as `galeo`, pointed
 * at the AppImage, a desktop entry that opens files with it, after `--` (SR-13), and the icon
 * that entry names, and the MDX type (shared-mime-info gives `.mdx` to a game ROM).
 */
export function appImageLauncher(
  appImage: string,
  dirs: LauncherDirs,
  launcherScript: string,
): LauncherFiles {
  if (/\p{Cc}/u.test(appImage)) return { ok: false, reason: 'the AppImage path has a control character' };
  if (!appImage.startsWith('/')) return { ok: false, reason: 'the AppImage path is not absolute' };
  const [shebang, ...rest] = launcherScript.split('\n');
  const script = rest.join('\n');
  if (!/^GALEO_BIN=.*$/m.test(script)) throw new Error('gal has no GALEO_BIN line');
  const bin = [shebang, LAUNCHER_MARK, script.replace(/^GALEO_BIN=.*$/m, () => `GALEO_BIN=${shellQuote(appImage)}`)].join('\n');
  const exec = execArgument(appImage);
  const desktop = [
    '[Desktop Entry]',
    'Name=galeo',
    // The .deb's entry takes its Comment from package.json's description (electron-builder).
    'Comment=A fast, private desktop app to read and edit Markdown, text, logs, JSON, CSV and source code',
    `Exec=${exec} -- %F`,
    'Icon=galeo',
    'Type=Application',
    'Terminal=false',
    'StartupWMClass=galeo',
    `MimeType=${MIME_TYPES.join(';')};`,
    'Categories=Utility;',
    'Actions=new-window;',
    ENTRY_MARK,
    '',
    '[Desktop Action new-window]',
    'Name=New Window',
    `Exec=${exec} --new-window`,
    '',
  ].join('\n');
  const paths = launcherPaths(dirs);
  return { ok: true, bin: { path: paths.bin, content: bin }, desktop: { path: paths.desktop, content: desktop }, icon: paths.icon, mime: paths.mime };
}

/**
 * Writes the launcher files: `galeo` runnable, the desktop entry and the `icon` readable. A `galeo` command
 * that isn't this app's stays as it is; folders that exist keep their modes. The icon is only looks: one
 * already there with other bytes stays, and the launcher still installs. So does the MDX type: a
 * `galeo.xml` galeo didn't write stays, and a database that won't update keeps the old types. Nothing is
 * written while the galeo package's desktop entry is at one of `packageEntries`.
 */
export async function installLauncher(
  deps: { fs: FileSystem; utf8: Utf8; refreshMime: (database: string) => Promise<void> },
  files: Extract<LauncherFiles, { ok: true }>,
  { icon, mime }: { icon: Uint8Array | null; mime: Uint8Array | null },
  packageEntries: readonly string[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { fs, utf8 } = deps;
  // The user entry would hide the package's own one (same desktop id), so the package stays in charge.
  for (const entry of packageEntries) {
    if ((await kindOf(fs, entry)) !== null) return { ok: false, reason: 'the galeo package is installed and already provides the galeo command' };
  }
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
  if (icon && (await iconFree(fs, files.icon.path, icon))) {
    const dir = folderOf(files.icon.path);
    if ((await kindOf(fs, dir)) !== 'directory') await fs.mkdir(dir, { mode: 0o755 });
    await fs.writeFileAtomic(files.icon.path, icon, { mode: 0o644 });
    // Desktops rescan an icon theme only when its own folder changes, not a size folder inside it.
    await fs.touch(files.icon.theme);
  }
  if (mime && (await ownedOrAbsent(deps, files.mime.path, MIME_MARK))) {
    const dir = folderOf(files.mime.path);
    if ((await kindOf(fs, dir)) !== 'directory') await fs.mkdir(dir, { mode: 0o755 });
    await fs.writeFileAtomic(files.mime.path, mime, { mode: 0o644 });
    await deps.refreshMime(files.mime.database).catch(() => undefined);
  }
  return { ok: true };
}

/**
 * Removes what `installLauncher` wrote: the `galeo` command, the desktop entry and the MDX type
 * only while they carry galeo's mark, and the icon only while it has `icon`'s bytes. Anything else
 * at those paths is kept and named in `kept`. The paths are the user's own; a package's files are
 * never among them.
 */
export async function uninstallLauncher(
  deps: { fs: FileSystem; utf8: Utf8; refreshMime: (database: string) => Promise<void> },
  paths: LauncherPaths,
  icon: Uint8Array | null,
): Promise<{ removed: string[]; kept: string[] }> {
  const { fs } = deps;
  const removed: string[] = [];
  const kept: string[] = [];
  const sort = async (path: string, mine: () => Promise<boolean>) => {
    if ((await kindOf(fs, path)) === null) return false;
    if (!(await mine())) {
      kept.push(path);
      return false;
    }
    await fs.remove(path);
    removed.push(path);
    return true;
  };
  await sort(paths.bin, () => marked(deps, paths.bin, LAUNCHER_MARK));
  await sort(paths.desktop, () => marked(deps, paths.desktop, ENTRY_MARK));
  if (await sort(paths.icon.path, async () => icon !== null && (await sameBytes(fs, paths.icon.path, icon)))) await fs.touch(paths.icon.theme);
  if (await sort(paths.mime.path, () => marked(deps, paths.mime.path, MIME_MARK))) await deps.refreshMime(paths.mime.database).catch(() => undefined);
  return { removed, kept };
}

/** The file at `path` carries galeo's `mark`. */
async function marked(deps: { fs: FileSystem; utf8: Utf8 }, path: string, mark: string): Promise<boolean> {
  try {
    return deps.utf8.decode(await deps.fs.readFile(path, { maxBytes: 64 * 1024 })).includes(mark);
  } catch {
    return false;
  }
}

/** The file at `path` has exactly `icon`'s bytes. */
async function sameBytes(fs: FileSystem, path: string, icon: Uint8Array): Promise<boolean> {
  try {
    const existing = await fs.readFile(path, { maxBytes: icon.length });
    return existing.length === icon.length && existing.every((byte, at) => byte === icon[at]);
  } catch {
    return false;
  }
}

/** Nothing is at `path`, or the same icon already is (the icon carries no mark). */
async function iconFree(fs: FileSystem, path: string, icon: Uint8Array): Promise<boolean> {
  return (await kindOf(fs, path)) === null || sameBytes(fs, path, icon);
}

/** Nothing is at `path`, or what is there carries galeo's `mark`. */
async function ownedOrAbsent(deps: { fs: FileSystem; utf8: Utf8 }, path: string, mark: string): Promise<boolean> {
  return (await kindOf(deps.fs, path)) === null || marked(deps, path, mark);
}
