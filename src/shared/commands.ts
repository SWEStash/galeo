import type { Command, Platform } from './keymap';

/**
 * Where a command runs: in the page, in main (window commands, over `window.command`), or only by
 * main's own key (a capability, ADR-004: the palette shows its key instead of running it).
 */
export type CommandRuns = 'page' | 'main' | 'capability';

export interface CommandInfo {
  /** The palette's name for it (UX §5). */
  label: string;
  group: string;
  runs: CommandRuns;
}

/** Every command's name in the palette (UX §5: every shortcut is also a palette command). */
export const COMMANDS = {
  quickOpen: { label: 'Quick open', group: 'File', runs: 'page' },
  commandPalette: { label: 'Command palette', group: 'App', runs: 'page' },
  find: { label: 'Find', group: 'Find', runs: 'page' },
  findNext: { label: 'Find next', group: 'Find', runs: 'page' },
  findPrevious: { label: 'Find previous', group: 'Find', runs: 'page' },
  toggleSource: { label: 'Toggle source view', group: 'View', runs: 'page' },
  toggleSplit: { label: 'Toggle split view', group: 'View', runs: 'page' },
  toggleWrap: { label: 'Toggle wrap', group: 'View', runs: 'page' },
  followEnd: { label: 'Follow end (logs)', group: 'View', runs: 'page' },
  toggleOutline: { label: 'Toggle outline', group: 'View', runs: 'page' },
  reload: { label: 'Reload from disk', group: 'File', runs: 'page' },
  back: { label: 'Back', group: 'Go', runs: 'page' },
  forward: { label: 'Forward', group: 'Go', runs: 'page' },
  newWindow: { label: 'New window', group: 'Window', runs: 'main' },
  closeTab: { label: 'Close tab', group: 'Tabs', runs: 'page' },
  closeWindow: { label: 'Close window', group: 'Window', runs: 'main' },
  reopenClosed: { label: 'Reopen closed tab or window', group: 'Tabs', runs: 'page' },
  nextTab: { label: 'Next tab', group: 'Tabs', runs: 'page' },
  previousTab: { label: 'Previous tab', group: 'Tabs', runs: 'page' },
  goToTab: { label: 'Go to tab', group: 'Tabs', runs: 'page' },
  goToLastTab: { label: 'Go to last tab', group: 'Tabs', runs: 'page' },
  moveTabLeft: { label: 'Move tab left', group: 'Tabs', runs: 'page' },
  moveTabRight: { label: 'Move tab right', group: 'Tabs', runs: 'page' },
  profileMenu: { label: 'Profile menu', group: 'App', runs: 'page' },
  settings: { label: 'Settings', group: 'App', runs: 'page' },
  zoomIn: { label: 'Zoom in', group: 'View', runs: 'page' },
  zoomOut: { label: 'Zoom out', group: 'View', runs: 'page' },
  zoomReset: { label: 'Reset zoom', group: 'View', runs: 'page' },
  fullScreen: { label: 'Full screen', group: 'Window', runs: 'main' },
  quit: { label: 'Quit', group: 'App', runs: 'main' },
  editMode: { label: 'Toggle edit mode', group: 'File', runs: 'capability' },
  save: { label: 'Save', group: 'File', runs: 'page' },
} as const satisfies Record<Command, CommandInfo>;

// macOS writes modifiers as symbols, in this order, with no separator.
const MAC_MODIFIERS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Cmd: '⌘', CmdOrCtrl: '⌘' };
const MAC_ORDER = ['⌃', '⌥', '⇧', '⌘'];
const KEY_NAMES: Record<string, string> = { Left: '←', Right: '→', Up: '↑', Down: '↓', PageUp: 'PgUp', PageDown: 'PgDn', Plus: '+' };

/** Accelerators as a reader sees them on `platform`: `Ctrl+Shift+P`, or `⇧⌘P` on macOS. */
export function formatKeys(accelerators: readonly string[], platform: Platform): string[] {
  return accelerators.map((accelerator) => {
    const parts = accelerator.split('+');
    const key = parts.pop()!;
    const name = KEY_NAMES[key] ?? key;
    if (platform !== 'darwin') return [...parts.map((part) => (part === 'CmdOrCtrl' || part === 'Cmd' ? 'Ctrl' : part)), name].join('+');
    const symbols = parts.map((part) => MAC_MODIFIERS[part] ?? part).sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    return symbols.join('') + name;
  });
}
