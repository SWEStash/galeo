import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../shared/csv';
import { columnStarts, columnWindow, countAtMost, keyToMove, lineAt, lowerBound, positionAt, rowAtPosition, sampleWidths } from './table-geometry';

describe('lineAt', () => {
  it('counts \\n, \\r\\n and a lone \\r as one line break each, from a known line', () => {
    expect(lineAt('a\nb\r\nc\rd', 0, 1, 8)).toBe(4);
    expect(lineAt('a\nb', 2, 5, 3)).toBe(5);
  });
});

describe('countAtMost and lowerBound', () => {
  it('find where a value falls in a sorted list', () => {
    expect(countAtMost(Uint32Array.from([1, 3, 3, 7]), 3)).toBe(3);
    expect(countAtMost(Uint32Array.from([1, 3]), 0)).toBe(0);
    expect(lowerBound(10, (index) => index * index < 30)).toBe(6);
    expect(lowerBound(0, () => true)).toBe(0);
  });
});

describe('sampleWidths and columnStarts', () => {
  it('sizes each column by its longest sampled cell, within the bounds, and lays the columns end to end', () => {
    const text = 'id,name\n1,' + 'x'.repeat(60) + '\n';
    const parsed = parseCsv(text, ',');
    if (parsed.state !== 'table') throw new Error('no table');
    const widths = sampleWidths(text, parsed.table);
    expect(widths).toEqual([4, 40]);
    expect([...columnStarts(widths)]).toEqual([0, 4, 44]);
  });
});

describe('columnWindow', () => {
  // Every column 100 px wide.
  const leftOf = (column: number) => column * 100;

  it('draws the columns in view and two beyond each side', () => {
    expect(columnWindow(50, leftOf, 1000, 1300)).toEqual([8, 16]);
    expect(columnWindow(50, leftOf, 0, 300)).toEqual([0, 6]);
  });

  it('draws at least one column, and none of an empty table', () => {
    expect(columnWindow(3, leftOf, 5000, 5300)).toEqual([1, 3]);
    expect(columnWindow(0, leftOf, 0, 300)).toEqual([0, 0]);
  });
});

describe('positionAt and rowAtPosition', () => {
  // Rows start on lines 1, 2 and 5; the last row ends before line 7.
  const rowLines = Uint32Array.from([1, 2, 5]);
  const lineOf = (row: number) => (row < 3 ? rowLines[row]! : 7);

  it('spreads a row over its lines, so a scroll halfway through it is halfway between them', () => {
    expect(positionAt(1.5, 3, lineOf)).toBe(3.5);
    expect(positionAt(2.5, 3, lineOf)).toBe(6);
    expect(positionAt(9, 3, lineOf)).toBe(7);
  });

  it('finds the fractional row a source line falls in', () => {
    expect(rowAtPosition(3.5, rowLines, 3, lineOf)).toBe(1.5);
    expect(rowAtPosition(1, rowLines, 3, lineOf)).toBe(0);
    expect(rowAtPosition(100, rowLines, 3, lineOf)).toBe(3);
  });
});

describe('keyToMove', () => {
  const at = { row: 5, column: 2 };
  const bounds = { page: 10, lastRow: 99, lastColumn: 7 };

  it('moves a cell with the arrows, a page with Page Up and Down', () => {
    expect(keyToMove('ArrowDown', false, at, bounds)).toEqual({ row: 6, column: 2 });
    expect(keyToMove('ArrowLeft', false, at, bounds)).toEqual({ row: 5, column: 1 });
    expect(keyToMove('PageUp', false, at, bounds)).toEqual({ row: -5, column: 2 });
  });

  it('goes to the row ends with Home and End, and the table ends with Ctrl', () => {
    expect(keyToMove('Home', false, at, bounds)).toEqual({ row: 5, column: 0 });
    expect(keyToMove('End', true, at, bounds)).toEqual({ row: 99, column: 7 });
  });

  it('leaves other keys, and Ctrl with anything but Home and End, to the page', () => {
    expect(keyToMove('a', false, at, bounds)).toBeNull();
    expect(keyToMove('ArrowDown', true, at, bounds)).toBeNull();
  });
});
