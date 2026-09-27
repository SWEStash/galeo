import { describe, expect, it } from 'vitest';
import { keymap } from './keymap';

describe('keymap', () => {
  it('uses CmdOrCtrl so one map serves every platform', () => {
    expect(keymap('linux').quickOpen).toEqual(['CmdOrCtrl+P']);
    expect(keymap('linux').settings).toEqual(['CmdOrCtrl+,']);
  });

  it('quits with Ctrl+Shift+Q, leaving Ctrl+Q unbound, outside macOS', () => {
    expect(keymap('linux').quit).toEqual(['Ctrl+Shift+Q']);
    expect(keymap('win32').quit).toEqual(['Ctrl+Shift+Q']);
  });

  it('follows the macOS convention of Cmd+Q to quit', () => {
    expect(keymap('darwin').quit).toEqual(['Cmd+Q']);
  });

  it('cycles tabs with Ctrl+Tab on every platform', () => {
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      expect(keymap(platform).nextTab).toContain('Ctrl+Tab');
    }
  });

  it('goes to tabs 1 to 8 and the last tab with the number keys', () => {
    expect(keymap('linux').goToTab).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `CmdOrCtrl+${n}`));
    expect(keymap('linux').goToLastTab).toEqual(['CmdOrCtrl+9']);
  });

  it('binds each accelerator to a single command', () => {
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      const all = Object.values(keymap(platform)).flat();
      expect(new Set(all).size).toBe(all.length);
    }
  });
});
