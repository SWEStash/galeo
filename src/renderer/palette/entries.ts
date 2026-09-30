import { COMMANDS, formatKeys } from '../../shared/commands';
import { keymap, type Command, type Platform, type WindowCommand } from '../../shared/keymap';

export type PaletteAction =
  | { kind: 'command'; command: Command; tabNumber?: number }
  | { kind: 'main'; command: WindowCommand }
  /** A capability (ADR-004): the palette names its key and grants nothing. */
  | { kind: 'hint'; message: string }
  | { kind: 'openWithDefaultApp' }
  | { kind: 'restorePrevious' }
  | { kind: 'clearRecent' };

export interface PaletteEntry {
  id: string;
  label: string;
  group: string;
  /** The keys that run it too, as the reader sees them. */
  keys: string[];
  action: PaletteAction;
}

/** Everything the palette offers: every command (UX §5), then the palette-only ones. */
export function paletteEntries(platform: Platform): PaletteEntry[] {
  const keys = keymap(platform);
  const entries: PaletteEntry[] = [];
  for (const command of Object.keys(COMMANDS) as Command[]) {
    const { label, group, runs } = COMMANDS[command];
    const shown = formatKeys(keys[command], platform);
    if (command === 'goToTab') {
      shown.forEach((key, index) => {
        const tabNumber = index + 1;
        entries.push({ id: `goToTab:${tabNumber}`, label: `${label} ${tabNumber}`, group, keys: [key], action: { kind: 'command', command, tabNumber } });
      });
      continue;
    }
    const action: PaletteAction =
      runs === 'capability'
        ? { kind: 'hint', message: `Press ${shown[0]}` }
        : runs === 'main'
          ? { kind: 'main', command: command as WindowCommand }
          : { kind: 'command', command };
    entries.push({ id: command, label, group, keys: shown, action });
  }
  entries.push(
    { id: 'openWithDefaultApp', label: 'Open with default app…', group: 'File', keys: [], action: { kind: 'openWithDefaultApp' } },
    { id: 'restorePrevious', label: 'Restore previous session', group: 'App', keys: [], action: { kind: 'restorePrevious' } },
    { id: 'clearRecent', label: 'Clear recent files', group: 'File', keys: [], action: { kind: 'clearRecent' } },
  );
  return entries;
}
