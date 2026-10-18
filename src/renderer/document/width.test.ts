import { describe, expect, it } from 'vitest';
import { widthLabel, widthStep } from './width';

describe('widthStep', () => {
  it('widens and narrows the setting by 8 ch, staying within 40 to 200 ch', () => {
    expect(widthStep(null, 72, 'wider')).toBe(80);
    expect(widthStep(null, 72, 'narrower')).toBe(64);
    expect(widthStep(200, 72, 'wider')).toBe(200);
    expect(widthStep(40, 72, 'narrower')).toBe(40);
  });

  it('moves from a width off the 8-ch grid to the next grid line in that direction', () => {
    expect(widthStep(null, 90, 'wider')).toBe(96);
    expect(widthStep(null, 90, 'narrower')).toBe(88);
  });

  it('keeps no width of its own once it is back at the setting', () => {
    expect(widthStep(80, 72, 'narrower')).toBeNull();
    expect(widthStep(64, 72, 'wider')).toBeNull();
    expect(widthStep(120, 72, 'reset')).toBeNull();
    expect(widthStep('full', 72, 'reset')).toBeNull();
  });

  it('toggles full width, back to the setting', () => {
    expect(widthStep(null, 72, 'full')).toBe('full');
    expect(widthStep(96, 72, 'full')).toBe('full');
    expect(widthStep('full', 72, 'full')).toBeNull();
  });

  it('stays full width when widened, and narrows from it to the widest column', () => {
    expect(widthStep('full', 72, 'wider')).toBe('full');
    expect(widthStep('full', 72, 'narrower')).toBe(200);
  });

  it('treats a full-width setting like a full-width tab', () => {
    expect(widthStep(null, 'full', 'wider')).toBeNull();
    expect(widthStep(null, 'full', 'narrower')).toBe(200);
    expect(widthStep(null, 'full', 'full')).toBeNull();
    expect(widthStep(200, 'full', 'full')).toBeNull();
  });
});

describe('widthLabel', () => {
  it('names a column width in ch, and full width in words', () => {
    expect(widthLabel(96)).toBe('96 ch');
    expect(widthLabel('full')).toBe('Full width');
  });
});
