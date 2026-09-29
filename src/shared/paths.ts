/** The last segment of a path, with `/` or `\` separators. */
export function fileName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
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
  return [dir, ...names].join(separator);
}
