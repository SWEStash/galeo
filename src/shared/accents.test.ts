import { describe, expect, it } from 'vitest';
import { ACCENTS, accentOf } from './accents';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// The tab bar the accent chip and the active-tab line sit on, in each scheme (tokens.css).
const TAB_BAR = { light: '#f6f8fa', dark: '#161b22' };

describe('ACCENTS (UX §6: presets only)', () => {
  it('offers 8 named, distinct colours', () => {
    expect(ACCENTS).toHaveLength(8);
    expect(new Set(ACCENTS.map((accent) => accent.color)).size).toBe(8);
    expect(new Set(ACCENTS.map((accent) => accent.name)).size).toBe(8);
    for (const accent of ACCENTS) expect(accent.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(ACCENTS.map((accent) => [accent.name, accent.color]))('%s stands out 3:1 on the tab bar in both schemes', (_name, color) => {
    expect(contrast(color, TAB_BAR.light)).toBeGreaterThanOrEqual(3);
    expect(contrast(color, TAB_BAR.dark)).toBeGreaterThanOrEqual(3);
  });

  it('gives a profile without an accent the first preset, and keeps a hand-picked one', () => {
    expect(accentOf(null)).toBe(ACCENTS[0]!.color);
    expect(accentOf('#123456')).toBe('#123456');
  });
});
