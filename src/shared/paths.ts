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
