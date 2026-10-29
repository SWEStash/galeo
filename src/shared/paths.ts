/** The last segment of a path, with `/` or `\` separators. */
export function fileName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/** The folder a path is in: all but its last segment, with `/` or `\` separators. */
export function folderOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
}

/** A file's extension, lower-case and with its dot (`.md`); '' when it has none. */
export function extensionOf(path: string): string {
  const name = fileName(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot);
}

/**
 * Joins names onto a folder with the separator the folder already uses, so a Windows path stays
 * one (`C:\…\settings.json`), without a platform module.
 */
export function joinPath(dir: string, ...names: string[]): string {
  const separator = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  // A root (`/`, `C:\`) already ends with its separator.
  return [dir.replace(/[\\/]$/, ''), ...names].join(separator);
}

/** A path as the reader sees it: `~/…` (`~\\…` on Windows) under the home folder, `~` for it, other paths whole. */
export function shownPath(path: string, home: string): string {
  if (path === home) return '~';
  return path.startsWith(`${home}/`) || path.startsWith(`${home}\\`) ? `~${path.slice(home.length)}` : path;
}
