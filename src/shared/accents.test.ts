import { describe, expect, it } from 'vitest';
import { ACCENTS, accentOf } from './accents';

describe('ACCENTS (UX §6: presets only)', () => {
  it('offers 8 named, distinct colours', () => {
    expect(ACCENTS).toHaveLength(8);
    expect(new Set(ACCENTS.map((accent) => accent.color)).size).toBe(8);
    expect(new Set(ACCENTS.map((accent) => accent.name)).size).toBe(8);
    for (const accent of ACCENTS) expect(accent.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('gives a profile without an accent the first preset, and keeps a hand-picked one', () => {
    expect(accentOf(null)).toBe(ACCENTS[0]!.color);
    expect(accentOf('#123456')).toBe('#123456');
  });
});
