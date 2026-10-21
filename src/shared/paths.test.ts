import { describe, expect, it } from 'vitest';
import { folderOf, joinPath, shownPath } from './paths';

describe('joinPath', () => {
  it('joins with the separator the folder already uses', () => {
    expect(joinPath('/home/me/.config/galeo', 'profiles', 'default')).toBe('/home/me/.config/galeo/profiles/default');
    expect(joinPath('C:\\Users\\me\\AppData\\galeo', 'settings.json')).toBe('C:\\Users\\me\\AppData\\galeo\\settings.json');
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
});
