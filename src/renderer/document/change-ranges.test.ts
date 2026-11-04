import { describe, expect, it } from 'vitest';
import { changedRanges } from './change-ranges';

const doc = (...lines: string[]) => `${lines.join('\n')}\n`;

describe('changedRanges', () => {
  it('finds nothing in the same text', async () => {
    expect(await changedRanges(doc('a', 'b'), doc('a', 'b'))).toEqual({ changed: [], removedAt: [] });
  });

  it('marks a line edited inside it', async () => {
    expect(await changedRanges(doc('one', 'two', 'three'), doc('one', 'TWO!', 'three'))).toEqual({ changed: [[2, 2]], removedAt: [] });
  });

  it('marks inserted lines, and only those', async () => {
    expect(await changedRanges(doc('a', 'd'), doc('a', 'b', 'c', 'd'))).toEqual({ changed: [[2, 3]], removedAt: [] });
  });

  it('marks an appended tail, with or without a final line break', async () => {
    expect(await changedRanges(doc('a'), doc('a', 'b', 'c'))).toEqual({ changed: [[2, 3]], removedAt: [] });
    expect(await changedRanges('a', 'a\nb')).toEqual({ changed: [[2, 2]], removedAt: [] });
  });

  it('marks where whole lines were removed: at the start, the middle and the end', async () => {
    expect(await changedRanges(doc('x', 'a', 'b'), doc('a', 'b'))).toEqual({ changed: [], removedAt: [1] });
    expect(await changedRanges(doc('a', 'x', 'y', 'b'), doc('a', 'b'))).toEqual({ changed: [], removedAt: [2] });
    expect(await changedRanges(doc('a', 'b', 'x'), doc('a', 'b'))).toEqual({ changed: [], removedAt: [3] });
  });

  it('sees a removed line as removed, even when its neighbour looks alike', async () => {
    // Removing "Step 8." and a blank line reads as either pair: both mark the block before "Step 9.".
    const { changed, removedAt } = await changedRanges(doc('Step 7.', '', 'Step 8.', '', 'Step 9.'), doc('Step 7.', '', 'Step 9.'));
    expect(changed).toEqual([]);
    expect([[2], [3]]).toContainEqual(removedAt);
  });

  it('treats a removal inside a line as a change to that line', async () => {
    expect(await changedRanges(doc('a', 'keep this', 'b'), doc('a', 'keep', 'b'))).toEqual({ changed: [[2, 2]], removedAt: [] });
  });

  it('finds scattered edits in order, merging neighbours', async () => {
    const base = Array.from({ length: 50 }, (_, n) => `line ${n + 1}`);
    const next = [...base];
    next[4] = 'line 5 edited';
    next[5] = 'line 6 edited';
    next[29] = 'line 30 edited';
    next.splice(40, 0, 'new line');
    expect(await changedRanges(doc(...base), doc(...next))).toEqual({ changed: [[5, 6], [30, 30], [41, 41]], removedAt: [] });
  });

  it('falls back to a diff of the characters past the distinct lines it can stand for', async () => {
    const base = Array.from({ length: 64_000 }, (_, n) => `line ${n}`);
    const next = [...base];
    next[100] = 'line one hundred';
    expect(await changedRanges(doc(...base), doc(...next))).toEqual({ changed: [[101, 101]], removedAt: [] });
  });

  it('counts lines the same with Windows line endings', async () => {
    expect(await changedRanges('a\r\nb\r\nc\r\n', 'a\r\nB\r\nc\r\n')).toEqual({ changed: [[2, 2]], removedAt: [] });
  });
});
