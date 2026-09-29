import { describe, expect, it } from 'vitest';
import { joinPath } from './paths';

describe('joinPath', () => {
  it('joins with the separator the folder already uses', () => {
    expect(joinPath('/home/me/.config/galeo', 'profiles', 'default')).toBe('/home/me/.config/galeo/profiles/default');
    expect(joinPath('C:\\Users\\me\\AppData\\galeo', 'settings.json')).toBe('C:\\Users\\me\\AppData\\galeo\\settings.json');
  });
});
