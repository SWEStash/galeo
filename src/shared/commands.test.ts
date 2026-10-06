import { describe, expect, it } from 'vitest';
import { COMMANDS, formatKeys } from './commands';
import { CAPABILITY_COMMANDS, keymap, WINDOW_COMMANDS, type Command } from './keymap';

describe('COMMANDS', () => {
  it('names every command in the keymap, with a group and where it runs', () => {
    for (const command of Object.keys(keymap('linux')) as Command[]) {
      expect(COMMANDS[command].label, command).toMatch(/\S/);
      expect(COMMANDS[command].group, command).toMatch(/\S/);
    }
  });

  it('runs capability commands through main\'s key only, window commands in main, and the rest in the page', () => {
    for (const command of Object.keys(COMMANDS) as Command[]) {
      const expected = CAPABILITY_COMMANDS.includes(command) ? 'capability' : (WINDOW_COMMANDS as readonly Command[]).includes(command) ? 'main' : 'page';
      expect(COMMANDS[command].runs, command).toBe(expected);
    }
  });

  it('labels each command once', () => {
    const labels = Object.values(COMMANDS).map((each) => each.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('formatKeys', () => {
  it('spells accelerators with Ctrl outside macOS', () => {
    expect(formatKeys(['CmdOrCtrl+Shift+P'], 'linux')).toEqual(['Ctrl+Shift+P']);
    expect(formatKeys(['F5', 'CmdOrCtrl+R'], 'win32')).toEqual(['F5', 'Ctrl+R']);
    expect(formatKeys(['Ctrl+Tab'], 'linux')).toEqual(['Ctrl+Tab']);
  });

  it('uses the macOS modifier symbols, in their conventional order', () => {
    expect(formatKeys(['CmdOrCtrl+Shift+P'], 'darwin')).toEqual(['⇧⌘P']);
    expect(formatKeys(['Cmd+Q'], 'darwin')).toEqual(['⌘Q']);
    expect(formatKeys(['Ctrl+Shift+Tab'], 'darwin')).toEqual(['⌃⇧Tab']);
    expect(formatKeys(['Alt+Z'], 'darwin')).toEqual(['⌥Z']);
  });

  it('names arrow and page keys as a reader expects', () => {
    expect(formatKeys(['Alt+Left', 'Alt+Right'], 'linux')).toEqual(['Alt+←', 'Alt+→']);
    expect(formatKeys(['CmdOrCtrl+Shift+PageUp', 'CmdOrCtrl+PageDown'], 'linux')).toEqual(['Ctrl+Shift+PgUp', 'Ctrl+PgDn']);
  });

  it('writes the Plus key as +', () => {
    expect(formatKeys(['CmdOrCtrl+Plus'], 'linux')).toEqual(['Ctrl++']);
    expect(formatKeys(['CmdOrCtrl+Plus'], 'darwin')).toEqual(['⌘+']);
  });
});
