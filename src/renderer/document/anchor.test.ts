import { describe, expect, it } from 'vitest';
import { blockAtOrBefore, firstVisibleLine } from './anchor';

describe('firstVisibleLine', () => {
  const blocks = [
    { line: 1, top: 0, bottom: 40 },
    { line: 3, top: 60, bottom: 120 },
    { line: 9, top: 140, bottom: 400 },
  ];

  it('is the line of the first block still visible below the viewport top', () => {
    expect(firstVisibleLine(blocks, 0)).toBe(1);
    expect(firstVisibleLine(blocks, 50)).toBe(3);
    expect(firstVisibleLine(blocks, 119)).toBe(3);
    expect(firstVisibleLine(blocks, 300)).toBe(9);
  });

  it('is the last block once scrolled past every block, and line 1 without blocks', () => {
    expect(firstVisibleLine(blocks, 1000)).toBe(9);
    expect(firstVisibleLine([], 0)).toBe(1);
  });
});

describe('blockAtOrBefore', () => {
  it('finds the block that starts at the line, or the nearest one before it', () => {
    const lines = [1, 3, 9, 20];
    expect(blockAtOrBefore(lines, 3)).toBe(1);
    expect(blockAtOrBefore(lines, 8)).toBe(1);
    expect(blockAtOrBefore(lines, 9)).toBe(2);
    expect(blockAtOrBefore(lines, 500)).toBe(3);
  });

  it('falls back to the first block before any block starts, and to none without blocks', () => {
    expect(blockAtOrBefore([4, 8], 2)).toBe(0);
    expect(blockAtOrBefore([], 5)).toBe(-1);
  });

  it('handles nested blocks, whose lines are not in document order', () => {
    // A list item (line 5) inside a list, then a later paragraph (line 12), then an earlier line.
    expect(blockAtOrBefore([5, 6, 12, 7], 10)).toBe(3);
  });
});
