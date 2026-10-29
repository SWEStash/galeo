// The CSV/TSV table's geometry (ADR-018, ADR-020): pure numbers for which columns to draw, how wide,
// where a key moves focus, and how rows map to fractional source lines for split's scroll sync.
import { cell, type CsvTable } from '../../shared/csv';
import { clamp, clamp01 } from '../../shared/math';

/** Columns drawn beyond each side of the view, and at most this many at once. */
const COLUMN_OVERSCAN = 2;
const MAX_DRAWN_COLUMNS = 300;
/** Column widths come from this many rows (fewer for a wide table), in characters within these bounds. */
const SAMPLE_ROWS = 200;
const SAMPLE_CELLS = 100_000;
const MIN_CHARS = 4;
const MAX_CHARS = 40;

const LF = 0x0a;
const CR = 0x0d;

/** The line `to` is on, counting line breaks from `from` (on `line`) as the source view counts them. */
export function lineAt(text: string, from: number, line: number, to: number): number {
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (c === LF || (c === CR && text.charCodeAt(i + 1) !== LF)) line++;
  }
  return line;
}

/** The first index of `count` that isn't `before`, for a `before` true up to some index and false after. */
export function lowerBound(count: number, before: (index: number) => boolean): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (before(middle)) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** How many of the sorted `values` are at most `value`. */
export function countAtMost(values: Uint32Array, value: number): number {
  return lowerBound(values.length, (index) => values[index]! <= value);
}

/** Each column's width in characters: its longest cell among the first rows (the header's too), within bounds. */
export function sampleWidths(text: string, table: CsvTable): number[] {
  const sampled = Math.min(table.rows, SAMPLE_ROWS, Math.max(1, Math.floor(SAMPLE_CELLS / Math.max(1, table.columns))));
  return Array.from({ length: table.columns }, (_, column) => {
    let longest = MIN_CHARS;
    for (let row = 0; row < sampled; row++) longest = Math.max(longest, (cell(text, table, row, column) ?? '').length);
    return Math.min(longest, MAX_CHARS);
  });
}

/** Where each column starts, in characters from the first, and where the last ends. */
export function columnStarts(widths: readonly number[]): Float64Array<ArrayBuffer> {
  const starts = new Float64Array(widths.length + 1);
  for (let column = 0; column < widths.length; column++) starts[column + 1] = starts[column]! + widths[column]!;
  return starts;
}

/** The columns to draw for a view from `from` to `to` (px, as `leftOf` measures): at least one, unless there are none. */
export function columnWindow(columns: number, leftOf: (column: number) => number, from: number, to: number): [number, number] {
  if (columns === 0) return [0, 0];
  // The first column whose right edge is past `from`, and the first that starts past `to`.
  const start = Math.max(0, lowerBound(columns, (column) => leftOf(column + 1) <= from) - COLUMN_OVERSCAN);
  const end = Math.min(columns, lowerBound(columns, (column) => leftOf(column) <= to) + COLUMN_OVERSCAN, start + MAX_DRAWN_COLUMNS);
  return [start, Math.max(end, Math.min(columns, start + 1))];
}

/** The fractional source line at fractional row `at`: a row spreads over its lines up to the next row's. */
export function positionAt(at: number, rows: number, lineOf: (row: number) => number): number {
  const row = Math.min(rows - 1, Math.floor(at));
  return lineOf(row) + Math.min(1, at - row) * (lineOf(row + 1) - lineOf(row));
}

/** The fractional row a fractional source line falls in. */
export function rowAtPosition(line: number, rowLines: Uint32Array, rows: number, lineOf: (row: number) => number): number {
  const row = clamp(countAtMost(rowLines, line) - 1, 0, rows - 1);
  const span = lineOf(row + 1) - lineOf(row);
  return row + (span > 0 ? clamp01((line - lineOf(row)) / span) : 0);
}

interface Cell {
  row: number;
  column: number;
}

/**
 * Where a key moves focus in the grid (UX F14): the arrows a cell, Page Up and Down a page, Home and
 * End the row's ends (the table's with Ctrl, or Cmd on macOS, where Cmd and an arrow also go to the
 * first or last row or the row's ends). Null for a key the grid leaves to the page. Not clamped.
 */
export function keyToMove(
  key: string,
  modifier: 'none' | 'ctrl' | 'cmd',
  at: Cell,
  { page, lastRow, lastColumn }: { page: number; lastRow: number; lastColumn: number },
): Cell | null {
  const jump = modifier !== 'none';
  if (modifier === 'cmd') {
    if (key === 'ArrowUp') return { row: 0, column: at.column };
    if (key === 'ArrowDown') return { row: lastRow, column: at.column };
    if (key === 'ArrowLeft') return { row: at.row, column: 0 };
    if (key === 'ArrowRight') return { row: at.row, column: lastColumn };
  }
  if (jump && key !== 'Home' && key !== 'End') return null;
  switch (key) {
    case 'ArrowDown':
      return { row: at.row + 1, column: at.column };
    case 'ArrowUp':
      return { row: at.row - 1, column: at.column };
    case 'ArrowRight':
      return { row: at.row, column: at.column + 1 };
    case 'ArrowLeft':
      return { row: at.row, column: at.column - 1 };
    case 'PageDown':
      return { row: at.row + page, column: at.column };
    case 'PageUp':
      return { row: at.row - page, column: at.column };
    case 'Home':
      return { row: jump ? 0 : at.row, column: 0 };
    case 'End':
      return { row: jump ? lastRow : at.row, column: lastColumn };
    default:
      return null;
  }
}
