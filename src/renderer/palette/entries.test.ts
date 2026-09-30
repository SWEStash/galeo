import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../../shared/commands';
import type { Command } from '../../shared/keymap';
import { paletteEntries } from './entries';

const byLabel = (platform: 'linux' | 'darwin', label: string) => paletteEntries(platform).find((entry) => entry.label === label);

describe('paletteEntries', () => {
  it('lists every command but "go to tab" under its label, with its keys', () => {
    const entries = paletteEntries('linux');
    for (const command of Object.keys(COMMANDS) as Command[]) {
      if (command === 'goToTab') continue;
      expect(entries.some((entry) => entry.label === COMMANDS[command].label), command).toBe(true);
    }
    expect(byLabel('linux', 'Command palette')?.keys).toEqual(['Ctrl+Shift+P']);
    expect(byLabel('linux', 'Reload from disk')?.keys).toEqual(['F5', 'Ctrl+R']);
    expect(byLabel('darwin', 'Quit')?.keys).toEqual(['⌘Q']);
  });

  it('offers going to each of tabs 1 to 8 by its own key', () => {
    const tabs = paletteEntries('linux').filter((entry) => entry.action.kind === 'command' && entry.action.command === 'goToTab');
    expect(tabs.map((entry) => [entry.label, entry.keys])).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`Go to tab ${n}`, [`Ctrl+${n}`]]));
    expect(tabs.map((entry) => entry.action)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ kind: 'command', command: 'goToTab', tabNumber: n })));
  });

  it('asks main for window commands', () => {
    expect(byLabel('linux', 'New window')?.action).toEqual({ kind: 'main', command: 'newWindow' });
    expect(byLabel('linux', 'Full screen')?.action).toEqual({ kind: 'main', command: 'fullScreen' });
  });

  it('only names the key of a capability: the palette never grants it', () => {
    expect(byLabel('linux', 'Toggle edit mode')?.action).toEqual({ kind: 'hint', message: 'Press Ctrl+E' });
    expect(byLabel('darwin', 'Toggle edit mode')?.action).toEqual({ kind: 'hint', message: 'Press ⌘E' });
  });

  it('adds the palette-only entries, which have no keys', () => {
    for (const [label, kind] of [
      ['Open with default app…', 'openWithDefaultApp'],
      ['Restore previous session', 'restorePrevious'],
      ['Clear recent files', 'clearRecent'],
    ] as const) {
      expect(byLabel('linux', label), label).toMatchObject({ keys: [], action: { kind } });
    }
  });

  it('gives each entry its own id', () => {
    const ids = paletteEntries('linux').map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
