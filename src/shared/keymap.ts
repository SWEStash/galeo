export type Platform = 'linux' | 'darwin' | 'win32';

/** The v0.1 shortcuts (UX §5). `CmdOrCtrl` is Cmd on macOS and Ctrl elsewhere. */
const BASE = {
  quickOpen: ['CmdOrCtrl+P'],
  commandPalette: ['CmdOrCtrl+Shift+P'],
  find: ['CmdOrCtrl+F'],
  findNext: ['F3'],
  findPrevious: ['Shift+F3'],
  toggleSource: ['CmdOrCtrl+U'],
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
  nextTab: ['Ctrl+Tab', 'CmdOrCtrl+PageDown'],
  previousTab: ['Ctrl+Shift+Tab', 'CmdOrCtrl+PageUp'],
  /** Tab N is the Nth accelerator. */
  goToTab: ['1', '2', '3', '4', '5', '6', '7', '8'].map((n) => `CmdOrCtrl+${n}`),
  goToLastTab: ['CmdOrCtrl+9'],
  moveTabLeft: ['CmdOrCtrl+Shift+PageUp'],
  moveTabRight: ['CmdOrCtrl+Shift+PageDown'],
  profileMenu: ['CmdOrCtrl+Shift+M'],
  settings: ['CmdOrCtrl+,'],
  zoomIn: ['CmdOrCtrl+='],
  zoomOut: ['CmdOrCtrl+-'],
  zoomReset: ['CmdOrCtrl+0'],
  fullScreen: ['F11'],
  // Ctrl+Q is left unbound to avoid accidental quits.
  quit: ['Ctrl+Shift+Q'],
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
const KEY_NAMES: Record<string, string> = { Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown' };

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
    event.shiftKey === wanted.shift &&
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
