// Checks a built package's desktop entry (ADR-008): files after `--` (SR-13), the MIME types
// galeo reads, the window class GNOME matches windows with, an icon, and the New Window action.

const MIME_TYPES = ['text/markdown', 'text/x-markdown', 'text/plain', 'text/x-log'];

/** The `key=value` lines of each `[group]`. */
function groups(text) {
  const result = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const header = /^\[(.+)\]$/.exec(line.trim());
    if (header) {
      current = new Map();
      result.set(header[1], current);
    } else if (current && line.includes('=') && !line.startsWith('#')) {
      const at = line.indexOf('=');
      current.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }
  }
  return result;
}

/** What is wrong with a desktop entry's text, as sentences; empty when nothing is. */
export function desktopEntryProblems(text) {
  const problems = [];
  const all = groups(text);
  const entry = all.get('Desktop Entry') ?? new Map();
  const exec = entry.get('Exec') ?? '';
  if (!/ -- %F$/.test(exec) || (exec.match(/%[fFuU]/g) ?? []).length !== 1) problems.push(`Exec must end with "-- %F": ${exec}`);
  const mimeTypes = (entry.get('MimeType') ?? '').split(';');
  for (const type of MIME_TYPES) if (!mimeTypes.includes(type)) problems.push(`MimeType lacks ${type}`);
  if (entry.get('StartupWMClass') !== 'galeo') problems.push('StartupWMClass must be galeo');
  if (!entry.get('Icon')) problems.push('no Icon');
  // GNOME Shell adds its own "New Window" to the dock menu unless the entry has an action with this id.
  if (!(entry.get('Actions') ?? '').split(';').includes('new-window')) problems.push('Actions does not list new-window');
  const action = all.get('Desktop Action new-window')?.get('Exec') ?? '';
  if (!/ --new-window$/.test(action)) problems.push('the New Window action must run --new-window, with no files');
  return problems;
}
