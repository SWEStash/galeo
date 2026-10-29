import { describe, expect, it } from 'vitest';
import { folderOf, joinPath, shownPath } from './paths';

describe('joinPath', () => {
  it('joins with the separator the folder already uses', () => {
    expect(joinPath('/home/me/.config/galeo', 'profiles', 'default')).toBe('/home/me/.config/galeo/profiles/default');
    expect(joinPath('C:\\Users\\me\\AppData\\galeo', 'settings.json')).toBe('C:\\Users\\me\\AppData\\galeo\\settings.json');
  });

  it('adds no second separator to a root', () => {
    expect(joinPath('/', '.git')).toBe('/.git');
    expect(joinPath('C:\\', '.git')).toBe('C:\\.git');
  });
});

describe('folderOf', () => {
  it('drops the last segment, with either separator', () => {
    expect(folderOf('/home/u/.local/bin/galeo')).toBe('/home/u/.local/bin');
    expect(folderOf('C:\\Users\\u\\custom.css')).toBe('C:\\Users\\u');
  });
});

describe('shownPath', () => {
  it('shows a path under the home folder as ~/…, the home folder as ~, and others whole', () => {
    expect(shownPath('/home/me/notes/today.md', '/home/me')).toBe('~/notes/today.md');
    expect(shownPath('/home/me', '/home/me')).toBe('~');
    expect(shownPath('/home/meg/x.md', '/home/me')).toBe('/home/meg/x.md');
    expect(shownPath('/srv/x.md', '/home/me')).toBe('/srv/x.md');
  });

  it('does the same with Windows paths', () => {
    expect(shownPath('C:\\Users\\me\\notes\\today.md', 'C:\\Users\\me')).toBe('~\\notes\\today.md');
    expect(shownPath('C:\\Users\\me', 'C:\\Users\\me')).toBe('~');
    expect(shownPath('C:\\Users\\meg\\x.md', 'C:\\Users\\me')).toBe('C:\\Users\\meg\\x.md');
  });
});
