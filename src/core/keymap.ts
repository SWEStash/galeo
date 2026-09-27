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
