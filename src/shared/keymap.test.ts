import { describe, expect, it } from 'vitest';
import { commandFor, keymap, type KeyEventLike } from './keymap';

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

describe('commandFor', () => {
  const key = (init: Partial<KeyEventLike> & { key: string }): KeyEventLike => ({
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...init,
  });

  it('maps CmdOrCtrl to Ctrl on Linux and Windows, and to Cmd on macOS', () => {
    expect(commandFor(key({ key: 'u', ctrlKey: true }), 'linux')).toBe('toggleSource');
    expect(commandFor(key({ key: 'u', ctrlKey: true }), 'win32')).toBe('toggleSource');
    expect(commandFor(key({ key: 'u', metaKey: true }), 'darwin')).toBe('toggleSource');
    expect(commandFor(key({ key: 'u', ctrlKey: true }), 'darwin')).toBeNull();
  });

  it('needs exactly the accelerator’s modifiers', () => {
    expect(commandFor(key({ key: 'z', altKey: true }), 'linux')).toBe('toggleWrap');
    expect(commandFor(key({ key: 'Z', altKey: true, shiftKey: true }), 'linux')).toBeNull();
    expect(commandFor(key({ key: 'u', ctrlKey: true, shiftKey: true }), 'linux')).toBeNull();
    expect(commandFor(key({ key: 'u' }), 'linux')).toBeNull();
  });

  it('matches letters case-insensitively, as Shift changes the key', () => {
    expect(commandFor(key({ key: 'P', ctrlKey: true, shiftKey: true }), 'linux')).toBe('commandPalette');
  });

  it('matches named keys', () => {
    expect(commandFor(key({ key: 'F3' }), 'linux')).toBe('findNext');
    expect(commandFor(key({ key: 'F3', shiftKey: true }), 'linux')).toBe('findPrevious');
    expect(commandFor(key({ key: 'ArrowLeft', altKey: true }), 'linux')).toBe('back');
    expect(commandFor(key({ key: 'PageDown', ctrlKey: true }), 'linux')).toBe('nextTab');
    expect(commandFor(key({ key: '=', ctrlKey: true }), 'linux')).toBe('zoomIn');
  });

  it('returns null for keys with no command', () => {
    expect(commandFor(key({ key: 'q', ctrlKey: true }), 'linux')).toBeNull();
    expect(commandFor(key({ key: 'Shift', shiftKey: true }), 'linux')).toBeNull();
  });
});
