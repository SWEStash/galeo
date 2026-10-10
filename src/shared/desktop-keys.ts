/**
 * Whether the Linux desktop keeps `accelerator` (Electron's form, `Ctrl+Shift+P`) for itself (UX §5):
 * anything with Super, anything with Ctrl+Alt (GNOME's workspaces, terminal and shell), and GNOME's
 * defaults without Super: Alt+Tab/Esc/Space/F1–F10/Print, Shift+Alt+Tab/Esc/F6.
 */
export function takenByDesktop(accelerator: string): boolean {
  const parts = accelerator.split('+');
  const key = parts.pop()!;
  const mods = new Set(parts.map((part) => (part === 'CmdOrCtrl' ? 'Ctrl' : part)));
  if (mods.has('Super') || mods.has('Meta')) return true;
  if (mods.has('Ctrl') && mods.has('Alt')) return true;
  if (!mods.has('Alt') || mods.has('Ctrl')) return false;
  if (mods.size === 1) return /^(Tab|Escape|Space|Print|F([1-9]|10))$/.test(key);
  return mods.size === 2 && mods.has('Shift') && /^(Tab|Escape|F6)$/.test(key);
}
