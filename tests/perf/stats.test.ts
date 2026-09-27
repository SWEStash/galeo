import { describe, expect, it } from 'vitest';
import { checkBudget, summarize } from './stats';

describe('summarize', () => {
  it('reports the median and nearest-rank p95 of the samples', () => {
    const samples = [120, 100, 110, 400, 130, 90, 105, 115, 125, 95];
    expect(summarize(samples)).toEqual({ n: 10, median: 112.5, p95: 400, min: 90, max: 400 });
  });

  it('uses the middle sample for an odd count', () => {
    expect(summarize([3, 1, 2])).toMatchObject({ median: 2, p95: 3 });
  });

  it('refuses an empty sample set', () => {
    expect(() => summarize([])).toThrow('no samples');
  });
});

describe('checkBudget', () => {
  it('passes when the median is within the budget times the factor', () => {
    expect(checkBudget({ n: 10, median: 900, p95: 1500, min: 800, max: 1500 }, 500, 2)).toEqual({
      ok: true,
      limit: 1000,
    });
  });

  it('fails when the median is over it', () => {
    expect(checkBudget({ n: 10, median: 501, p95: 600, min: 450, max: 600 }, 500, 1)).toEqual({
      ok: false,
      limit: 500,
    });
  });
});
