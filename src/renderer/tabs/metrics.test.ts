import { describe, expect, it } from 'vitest';
import { metricsLabel } from './metrics';

describe('metricsLabel', () => {
  it('joins the line count, the words and their reading time', () => {
    expect(metricsLabel(1234, 2310)).toBe('1,234 ln · 2,310 words · 10 min');
  });

  it('leaves out what the document has no count for', () => {
    expect(metricsLabel(301, null)).toBe('301 ln');
    expect(metricsLabel(null, 460)).toBe('460 words · 2 min');
    expect(metricsLabel(null, null)).toBeNull();
  });

  it('says "1 word", and no reading time with nothing to read', () => {
    expect(metricsLabel(null, 1)).toBe('1 word · < 1 min');
    expect(metricsLabel(1, 0)).toBe('1 ln · 0 words');
  });
});
