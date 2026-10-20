// The CSV/TSV reader behind the table view (ADR-018): RFC 4180 quoting, read leniently. One linear
// pass over character codes, no regular expressions; the result is offsets into the text, not
// strings, so millions of cells cost a few typed arrays and cross from the worker as transferables.

export type Separator = ',' | ';' | '\t' | '|';

/** A table's separator as the reader sets it: `auto` sniffs it (ADR-021). */
export type SeparatorChoice = 'auto' | Separator;

/**
 * How much one table may hold: past `rows` the rest is counted, past `fields` or with a row wider
 * than `columns` it is too large.
 */
export interface CsvLimits {
  rows: number;
  fields: number;
  columns: number;
}

/** The starting values (ADR-018 "Limits"): 10M fields' offsets are 40 MB; 10,000 columns still scroll sideways well. */
export const CSV_LIMITS: CsvLimits = { rows: 1_000_000, fields: 10_000_000, columns: 10_000 };

export interface CsvTable {
  separator: Separator;
  /** Rows kept (at most the row cap) and rows in the text. */
  rows: number;
  totalRows: number;
  /** Fields in the widest row kept. */
  columns: number;
  /** Per row kept: where it starts in the text, and its 1-based source line. */
  rowStarts: Uint32Array;
  rowLines: Uint32Array;
  /** Per row kept, the index of its first field in `fieldEnds`; one more entry closes the last row. */
  rowFields: Uint32Array;
  /** Where each field ends in the text; it starts one past the previous field's end, or at its row's start. */
  fieldEnds: Uint32Array;
}

export type CsvParse = { state: 'table'; table: CsvTable } | { state: 'too-large' };

const QUOTE = 0x22;
const LF = 0x0a;
const CR = 0x0d;
const BOM = 0xfeff;

/** A `Uint32Array` that grows as it is filled. */
class Offsets {
  private data = new Uint32Array(1024);
  length = 0;
  push(value: number) {
    if (this.length === this.data.length) {
      const grown = new Uint32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[this.length++] = value;
  }
  /** Exactly the values pushed, in a buffer of their own. */
  done(): Uint32Array {
    return this.data.slice(0, this.length);
  }
}

const SNIFFED: readonly Separator[] = [',', ';', '\t', '|'];

/** The separator found most in the first lines, outside quotes; a comma on a tie (ADR-021). */
function sniff(text: string, from: number): Separator {
  const counts = [0, 0, 0, 0];
  let quoted = false;
  let lines = 0;
  for (let i = from; i < text.length && lines < 10; i++) {
    const c = text.charCodeAt(i);
    // `""` inside quotes toggles twice: still quoted.
    if (c === QUOTE) quoted = !quoted;
    else if (quoted) continue;
    else if (c === 0x2c) counts[0]!++;
    else if (c === 0x3b) counts[1]!++;
    else if (c === 0x09) counts[2]!++;
    else if (c === 0x7c) counts[3]!++;
    else if (c === LF || c === CR) lines++;
  }
  let best = 0;
  for (let index = 1; index < counts.length; index++) if (counts[index]! > counts[best]!) best = index;
  return SNIFFED[best]!;
}

export function parseCsv(text: string, separator: Separator | 'sniff', limits: CsvLimits = CSV_LIMITS): CsvParse {
  const length = text.length;
  let pos = text.charCodeAt(0) === BOM ? 1 : 0;
  const sep = separator === 'sniff' ? sniff(text, pos) : separator;
  const sepCode = sep.charCodeAt(0);
  const rowStarts = new Offsets();
  const rowLines = new Offsets();
  const rowFields = new Offsets();
  const fieldEnds = new Offsets();
  let line = 1;
  let totalRows = 0;
  let columns = 0;

  while (pos < length) {
    const keep = totalRows < limits.rows;
    totalRows++;
    if (keep) {
      rowStarts.push(pos);
      rowLines.push(line);
      rowFields.push(fieldEnds.length);
    }
    let fields = 0;
    for (;;) {
      if (text.charCodeAt(pos) === QUOTE) {
        // A quoted part: to its closing quote (`""` is a quote), line breaks and all.
        pos++;
        while (pos < length) {
          const c = text.charCodeAt(pos);
          if (c === QUOTE) {
            if (text.charCodeAt(pos + 1) !== QUOTE) {
              pos++;
              break;
            }
            pos += 2;
            continue;
          }
          if (c === LF || (c === CR && text.charCodeAt(pos + 1) !== LF)) line++;
          pos++;
        }
      }
      // The unquoted part (all of an unquoted field, anything after a closing quote).
      while (pos < length) {
        const c = text.charCodeAt(pos);
        if (c === sepCode || c === LF || c === CR) break;
        pos++;
      }
      fields++;
      if (keep) {
        if (fieldEnds.length >= limits.fields) return { state: 'too-large' };
        fieldEnds.push(pos);
      }
      if (pos < length && text.charCodeAt(pos) === sepCode) {
        pos++;
        continue;
      }
      // The end of the record: CRLF, LF or CR, or the end of the text.
      if (text.charCodeAt(pos) === CR) pos++;
      if (text.charCodeAt(pos) === LF) pos++;
      line++;
      break;
    }
    if (keep && fields > limits.columns) return { state: 'too-large' };
    if (keep && fields > columns) columns = fields;
  }
  rowFields.push(fieldEnds.length);

  const table: CsvTable = {
    separator: sep,
    rows: rowStarts.length,
    totalRows,
    columns,
    rowStarts: rowStarts.done(),
    rowLines: rowLines.done(),
    rowFields: rowFields.done(),
    fieldEnds: fieldEnds.done(),
  };
  return { state: 'table', table };
}

/** The text of a cell, unquoted; null past the end of its row. */
export function cell(text: string, table: CsvTable, row: number, column: number): string | null {
  const first = table.rowFields[row]!;
  const index = first + column;
  if (index >= table.rowFields[row + 1]!) return null;
  const start = column === 0 ? table.rowStarts[row]! : table.fieldEnds[index - 1]! + 1;
  const end = table.fieldEnds[index]!;
  if (text.charCodeAt(start) !== QUOTE) return text.slice(start, end);
  let value = '';
  let at = start + 1;
  for (;;) {
    const quote = text.indexOf('"', at);
    if (quote === -1 || quote >= end) return value + text.slice(at, end);
    value += text.slice(at, quote);
    if (quote + 1 < end && text.charCodeAt(quote + 1) === QUOTE) {
      value += '"';
      at = quote + 2;
    } else {
      // The closing quote: anything after it is kept as written.
      return value + text.slice(quote + 1, end);
    }
  }
}
