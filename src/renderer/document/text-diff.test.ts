import { describe, expect, it } from 'vitest';
import { diffSpan } from './text-diff';

const apply = (old: string, span: { from: number; to: number; insert: string }) => old.slice(0, span.from) + span.insert + old.slice(span.to);

describe('diffSpan', () => {
  it('replaces only the span that differs, keeping the text before and after it', () => {
    expect(diffSpan('one two three', 'one 2 three')).toEqual({ from: 4, to: 7, insert: '2' });
    expect(diffSpan('abc', 'abXc')).toEqual({ from: 2, to: 2, insert: 'X' });
    expect(diffSpan('abc', 'ac')).toEqual({ from: 1, to: 2, insert: '' });
  });

  it("doesn't let the common start and end overlap when the text repeats", () => {
    for (const [old, text] of [['aaa', 'aaaa'], ['abab', 'ab'], ['', 'x'], ['x', '']] as const) {
      expect(apply(old, diffSpan(old, text))).toBe(text);
    }
  });
});
