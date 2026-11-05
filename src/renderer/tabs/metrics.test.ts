import { describe, expect, it } from 'vitest';
import { metricsLabel, tasksLabel } from './metrics';

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

describe('tasksLabel', () => {
  it("says how many of a document's tasks are done", () => {
    expect(tasksLabel({ done: 7, total: 12 })).toBe('7 of 12 tasks');
    expect(tasksLabel({ done: 0, total: 1 })).toBe('0 of 1 task');
    expect(tasksLabel({ done: 1200, total: 1500 })).toBe('1,200 of 1,500 tasks');
    expect(tasksLabel(null)).toBeNull();
  });
});
