export type Platform = 'linux' | 'darwin' | 'win32';

/** The v0.1 shortcuts (UX §5). `CmdOrCtrl` is Cmd on macOS and Ctrl elsewhere. */
const BASE = {
  quickOpen: ['CmdOrCtrl+P'],
  commandPalette: ['CmdOrCtrl+Shift+P'],
  find: ['CmdOrCtrl+F'],
  findNext: ['F3'],
  findPrevious: ['Shift+F3'],
  /** Edit mode only (UX §5). */
  findReplace: ['CmdOrCtrl+H'],
  toggleSource: ['CmdOrCtrl+U'],
  /** Source and rendered side by side (ADR-014). */
  toggleSplit: ['CmdOrCtrl+\\'],
  toggleWrap: ['Alt+Z'],
  /** Logs: jump to the end and keep following it; scrolling up leaves. */
  followEnd: ['End'],
  toggleOutline: ['CmdOrCtrl+Shift+O'],
  reload: ['F5', 'CmdOrCtrl+R'],
  back: ['Alt+Left'],
  forward: ['Alt+Right'],
  newWindow: ['CmdOrCtrl+N'],
  closeTab: ['CmdOrCtrl+W'],
  closeWindow: ['CmdOrCtrl+Shift+W'],
  reopenClosed: ['CmdOrCtrl+Shift+T'],
  /** Tab search (UX F16). */
  searchTabs: ['CmdOrCtrl+Shift+A'],
  /** The tab overview (UX F17). */
  tabOverview: ['CmdOrCtrl+Shift+E'],
  nextTab: ['Ctrl+Tab', 'CmdOrCtrl+PageDown'],
  previousTab: ['Ctrl+Shift+Tab', 'CmdOrCtrl+PageUp'],
  /** Tab N is the Nth accelerator. */
  goToTab: ['1', '2', '3', '4', '5', '6', '7', '8'].map((n) => `CmdOrCtrl+${n}`),
  goToLastTab: ['CmdOrCtrl+9'],
  moveTabLeft: ['CmdOrCtrl+Shift+PageUp'],
  moveTabRight: ['CmdOrCtrl+Shift+PageDown'],
  // Palette only (UX §5), as is dragging the tab (ADR-019).
  moveTabToNewWindow: [],
  moveTabToWindow: [],
  profileMenu: ['CmdOrCtrl+Shift+M'],
  settings: ['CmdOrCtrl+,'],
  /** Ctrl++ as most apps; Ctrl+= too, on layouts where = needs no Shift. */
  zoomIn: ['CmdOrCtrl+Plus', 'CmdOrCtrl+='],
  zoomOut: ['CmdOrCtrl+-'],
  zoomReset: ['CmdOrCtrl+0'],
  /** The tab's reading column, with Alt as zoom has Ctrl (UX §5); Full width from the palette. */
  widenReader: ['Alt+Plus', 'Alt+='],
  narrowReader: ['Alt+-'],
  resetReaderWidth: ['Alt+0'],
  fullWidth: [],
  fullScreen: ['F11'],
  // Ctrl+Q is left unbound to avoid accidental quits.
  quit: ['Ctrl+Shift+Q'],
  /** Edit mode; a capability key, so main owns it (ADR-013). */
  editMode: ['CmdOrCtrl+E'],
  /** Saves the tab in edit mode. */
  save: ['CmdOrCtrl+S'],
  /** The JSON tree (ADR-018): palette commands, no keys of their own (UX F14). */
  expandAll: [],
  collapseAll: [],
  copyJsonPath: [],
  /** Table options (ADR-021): palette commands, also run by the status bar's Table options menu. */
  tableSeparatorAuto: [],
  tableSeparatorComma: [],
  tableSeparatorSemicolon: [],
  tableSeparatorTab: [],
  tableSeparatorPipe: [],
  toggleTableHeader: [],
  resetTableOptions: [],
  showAsTable: [],
} satisfies Record<string, string[]>;

export type Command = keyof typeof BASE;

/** Platform conventions that differ from the base map. */
const MACOS: Partial<Record<Command, string[]>> = { quit: ['Cmd+Q'] };

export function keymap(platform: Platform): Record<Command, string[]> {
  return platform === 'darwin' ? { ...BASE, ...MACOS } : BASE;
}

/** The part of a `KeyboardEvent` (or Electron's `Input`) that matching needs. */
export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

// Accelerator key names (Electron's) that differ from `KeyboardEvent.key`.
const KEY_NAMES: Record<string, string> = { Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', Plus: '+' };

// Keys some layouts type with Shift and others without (+ on US vs Spanish): Shift doesn't count.
const SHIFT_EITHER_WAY = new Set(['Plus']);

function matches(accelerator: string, event: KeyEventLike, platform: Platform): boolean {
  const parts = accelerator.split('+');
  const key = parts.pop()!;
  const wanted = { ctrl: false, alt: false, shift: false, meta: false };
  for (const part of parts) {
    if (part === 'CmdOrCtrl') wanted[platform === 'darwin' ? 'meta' : 'ctrl'] = true;
    else if (part === 'Cmd') wanted.meta = true;
    else if (part === 'Ctrl') wanted.ctrl = true;
    else if (part === 'Alt') wanted.alt = true;
    else if (part === 'Shift') wanted.shift = true;
  }
  return (
    event.ctrlKey === wanted.ctrl &&
    event.altKey === wanted.alt &&
    (SHIFT_EITHER_WAY.has(key) || event.shiftKey === wanted.shift) &&
    event.metaKey === wanted.meta &&
    event.key.toLowerCase() === (KEY_NAMES[key] ?? key).toLowerCase()
  );
}

/** The command a key press triggers on `platform`, or null. */
export function commandFor(event: KeyEventLike, platform: Platform): Command | null {
  const map = keymap(platform);
  for (const command of Object.keys(map) as Command[]) {
    if (map[command].some((accelerator) => matches(accelerator, event, platform))) return command;
  }
  return null;
}

/** Which tab (1 to 8) a "go to tab" press names, or null for any other key. */
export function tabNumberFor(event: KeyEventLike, platform: Platform): number | null {
  const index = keymap(platform).goToTab.findIndex((accelerator) => matches(accelerator, event, platform));
  return index < 0 ? null : index + 1;
}

/**
 * Commands that grant a capability (ADR-004): main handles their keys in `before-input-event`, so
 * the page never sees them and can't fake them.
 */
export const CAPABILITY_COMMANDS: readonly Command[] = ['editMode'];

/**
 * Window commands main handles in `before-input-event` too: they work while the page is busy or
 * hung, and need no channel from the page.
 */
export const WINDOW_COMMANDS = ['newWindow', 'closeWindow', 'quit', 'fullScreen'] as const satisfies readonly Command[];
export type WindowCommand = (typeof WINDOW_COMMANDS)[number];

/** A key main takes before the page sees it: a capability or a window command. */
export function mainCommandFor(event: KeyEventLike, platform: Platform): Command | null {
  const command = commandFor(event, platform);
  return command && (CAPABILITY_COMMANDS.includes(command) || (WINDOW_COMMANDS as readonly Command[]).includes(command)) ? command : null;
}
