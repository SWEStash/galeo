import { describe, expect, it } from 'vitest';
import { cell, parseCsv, type CsvLimits, type CsvTable, type Separator } from './csv';

/** Every row's cells, as the table would show them. */
function grid(text: string, separator: Separator | 'sniff' = ',', limits?: CsvLimits): string[][] {
  const table = tableOf(text, separator, limits);
  return Array.from({ length: table.rows }, (_, row) => {
    const cells: string[] = [];
    for (let column = 0; cell(text, table, row, column) !== null; column++) cells.push(cell(text, table, row, column)!);
    return cells;
  });
}

function tableOf(text: string, separator: Separator | 'sniff' = ',', limits?: CsvLimits): CsvTable {
  const parsed = parseCsv(text, separator, limits);
  if (parsed.state !== 'table') throw new Error(`expected a table, got ${parsed.state}`);
  return parsed.table;
}

describe('CSV parser', () => {
  it('splits rows on line ends and fields on the separator', () => {
    expect(grid('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('reads TSV with the tab as separator', () => {
    expect(grid('a\tb,c\n1\t2\n', '\t')).toEqual([
      ['a', 'b,c'],
      ['1', '2'],
    ]);
  });

  it('keeps separators, quotes and line breaks inside quoted fields', () => {
    expect(grid('"a,b","say ""hi""","two\nlines"\r\nx,"",y\n')).toEqual([
      ['a,b', 'say "hi"', 'two\nlines'],
      ['x', '', 'y'],
    ]);
  });

  it('accepts CRLF, LF and a lone CR as line ends, and no line end after the last row', () => {
    expect(grid('a\r\nb\nc\rd')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('skips a byte order mark', () => {
    expect(grid('﻿a,b\n')).toEqual([['a', 'b']]);
  });

  it('keeps ragged rows as written and counts the widest as the column count', () => {
    const text = 'a,b\n1\n1,2,3\n';
    expect(grid(text)).toEqual([['a', 'b'], ['1'], ['1', '2', '3']]);
    expect(tableOf(text).columns).toBe(3);
  });

  it('keeps an empty line as a row with one empty field, and a trailing separator as an empty field', () => {
    expect(grid('a,\n\nb\n')).toEqual([['a', ''], [''], ['b']]);
  });

  it('reads nothing from empty text', () => {
    expect(tableOf('')).toMatchObject({ rows: 0, totalRows: 0, columns: 0 });
  });

  it('takes a quote inside an unquoted field, and text after a closing quote, literally', () => {
    expect(grid('5" disk,"a"b\n')).toEqual([['5" disk', 'ab']]);
  });

  it('runs an unclosed quote to the end of the text', () => {
    expect(grid('a,"b\nc\n')).toEqual([['a', 'b\nc\n']]);
  });

  it('notes the source line each row starts on, counting line breaks inside quotes', () => {
    const table = tableOf('h\n"two\r\nlines"\nx\r\ny');
    expect(Array.from(table.rowLines)).toEqual([1, 2, 4, 5]);
  });

  it('recognises ";" in a .csv from the first lines, ignoring what is quoted', () => {
    expect(tableOf('a;b;"c,d,e"\n1;2;3\n', 'sniff').separator).toBe(';');
    expect(tableOf('a,b;c\n1,2\n', 'sniff').separator).toBe(',');
    expect(grid('"x,y";2\n', 'sniff')).toEqual([['x,y', '2']]);
  });

  it('recognises a tab or a pipe the same way, and reads a pipe-separated table', () => {
    expect(tableOf('a\tb\tc\n1\t2\t3\n', 'sniff').separator).toBe('\t');
    expect(tableOf('a|b|"c,d"\n1|2|3\n', 'sniff').separator).toBe('|');
    expect(grid('a|b\n"x|y"|2\n', '|')).toEqual([['a', 'b'], ['x|y', '2']]);
  });

  it('takes a comma when no separator is found more than another', () => {
    expect(tableOf('a;b,c\n', 'sniff').separator).toBe(',');
    expect(tableOf('plain\n', 'sniff').separator).toBe(',');
  });

  it('keeps the first rows up to the cap and still counts them all', () => {
    const table = tableOf('a\nb\nc\nd\n', ',', { rows: 2, fields: 100 });
    expect(table).toMatchObject({ rows: 2, totalRows: 4 });
    expect(grid('a\nb\nc\nd\n', ',', { rows: 2, fields: 100 })).toEqual([['a'], ['b']]);
  });

  it('counts rows past the cap by records, not lines, so quoted line breaks do not add rows', () => {
    expect(tableOf('a\nb\n"c\nc"\nd\n', ',', { rows: 1, fields: 100 }).totalRows).toBe(4);
  });

  it('is too large past the field cap, however few the rows', () => {
    expect(parseCsv('a,b,c,d,e,f\n', ',', { rows: 100, fields: 5 })).toEqual({ state: 'too-large' });
  });

  it('answers null for a column past the end of a ragged row', () => {
    const text = 'a,b\n1\n';
    expect(cell(text, tableOf(text), 1, 1)).toBeNull();
  });

  describe('round trip over random tables', () => {
    /** A small seeded generator (mulberry32), so a failure can be replayed from its seed. */
    function random(seed: number) {
      return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const ALPHABET = ['a', 'Z', '7', ' ', 'é', ',', ';', '\t', '|', '"', '\n', '\r', '\r\n'];

    /** RFC 4180 writing: quoted when it must be (and now and then when it needn't), `"` doubled. */
    function serialise(rows: string[][], separator: Separator, next: () => number): string {
      const field = (value: string) =>
        value.includes(separator) || /["\r\n]/.test(value) || next() < 0.2 ? `"${value.replaceAll('"', '""')}"` : value;
      return rows.map((row) => `${row.map(field).join(separator)}\n`).join('');
    }

    it.each([',', ';', '\t', '|'] as const)('reads back what was written with %j', (separator) => {
      for (let seed = 1; seed <= 300; seed++) {
        const next = random(seed);
        const rows = Array.from({ length: Math.floor(next() * 6) }, () =>
          Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
            Array.from({ length: Math.floor(next() * 5) }, () => ALPHABET[Math.floor(next() * ALPHABET.length)]).join(''),
          ),
        );
        const text = serialise(rows, separator, next);
        expect({ seed, rows: grid(text, separator) }).toEqual({ seed, rows });
      }
    });
  });
});
