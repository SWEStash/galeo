import { describe, expect, it } from 'vitest';
import { folderOf, joinPath } from './paths';

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
