import { describe, expect, it } from 'vitest';
import { anchorAt, blockAtOrBefore, firstVisibleLine, scrollTopFor } from './anchor';

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

describe('anchorAt', () => {
  const blocks = [
    { line: 1, top: 0, bottom: 40, heading: 'user-content-intro' },
    { line: 3, top: 60, bottom: 120, heading: null },
    { line: 9, top: 140, bottom: 400, heading: 'user-content-goals' },
    { line: 30, top: 420, bottom: 900, heading: null },
  ];
  const scroll = (top: number) => ({ top, height: 1000, viewport: 200 });

  it('names the first visible block, how far into it, the heading above and the fraction', () => {
    expect(anchorAt(blocks, scroll(470))).toEqual({ line: 30, offset: 50, heading: 'user-content-goals', fraction: 470 / 800 });
    expect(anchorAt(blocks, scroll(0))).toEqual({ line: 1, offset: 0, heading: 'user-content-intro', fraction: 0 });
  });

  it('works without blocks or headings, and for a document shorter than its viewport', () => {
    expect(anchorAt([], { top: 0, height: 100, viewport: 200 })).toEqual({ line: 1, offset: 0, heading: null, fraction: 0 });
    expect(anchorAt([{ line: 4, top: 0, bottom: 50, heading: null }], scroll(10)).heading).toBeNull();
  });
});

describe('scrollTopFor', () => {
  const blocks = [
    { line: 1, top: 0, bottom: 40, heading: 'user-content-intro' },
    { line: 9, top: 140, bottom: 400, heading: 'user-content-goals' },
  ];
  const size = { height: 1000, viewport: 200 };

  it('goes back into the same block by the same offset', () => {
    expect(scrollTopFor({ line: 9, offset: 50, heading: null, fraction: 0.9 }, blocks, size)).toBe(190);
  });

  it('keeps the offset inside a block that got shorter', () => {
    expect(scrollTopFor({ line: 1, offset: 300, heading: null, fraction: 0 }, blocks, size)).toBe(40);
  });

  it('falls back to the heading, then to the fraction of the way down', () => {
    expect(scrollTopFor({ line: 5, offset: 0, heading: 'user-content-goals', fraction: 0.9 }, blocks, size)).toBe(140);
    expect(scrollTopFor({ line: 5, offset: 0, heading: 'user-content-gone', fraction: 0.5 }, blocks, size)).toBe(400);
  });
});
