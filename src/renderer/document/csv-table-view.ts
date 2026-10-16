// The CSV/TSV table view (ADR-018, UX F14): an ARIA grid that draws only the rows in view, so a
// million rows open and scroll like a few. Plain DOM inside the document's shadow root (ADR-006),
// like the JSON tree. The first row is the header and stays in view; one cell is in the tab order,
// and the focused one is always drawn, wherever the view scrolls.
import { cell, type CsvTable } from '../../shared/csv';

/** Every row is this tall (px), so a row's place is its index times this. */
export const TABLE_ROW_HEIGHT = 24;

/** Rows drawn beyond each edge of the view, so a scroll shows no gap before the next frame. */
const OVERSCAN = 10;

/** Column widths come from the first rows, in characters, within these bounds. */
const SAMPLE_ROWS = 200;
const MIN_CHARS = 4;
const MAX_CHARS = 40;

export interface CsvTableView {
  readonly element: HTMLElement;
  /** Shows a table; a new version of the text keeps the scroll and the focused cell, by index. */
  setTable(text: string, table: CsvTable): void;
  focus(): void;
  /** The source line of the row at the top of the view (the header's at the very top). */
  topLine(): number;
  /** Puts the row on (or above) `line` at the top of the view, under the header. */
  scrollToLine(line: number): void;
  /** The top of the view as a fractional source line, and back: split's scroll sync (ADR-014). */
  topPosition(): number;
  scrollToPosition(line: number): void;
  /** Draws now (scrolling draws on the next frame). */
  flush(): void;
  dispose(): void;
}

const LF = 0x0a;
const CR = 0x0d;

/** The line `to` is on, counting line breaks from `from` (on `line`) as the source view counts them. */
function lineAt(text: string, from: number, line: number, to: number): number {
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (c === LF || (c === CR && text.charCodeAt(i + 1) !== LF)) line++;
  }
  return line;
}

/** How many of the sorted `values` are at most `value`. */
function countAtMost(values: Uint32Array, value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function createCsvTableView({ parent, scroller, label }: { parent: HTMLElement; scroller: () => HTMLElement; label: string }): CsvTableView {
  const element = document.createElement('div');
  element.className = 'galeo-csv-table';
  element.setAttribute('role', 'grid');
  element.setAttribute('aria-label', label);
  const header = document.createElement('div');
  header.className = 'galeo-csv-header';
  header.setAttribute('role', 'row');
  header.setAttribute('aria-rowindex', '1');
  const body = document.createElement('div');
  body.className = 'galeo-csv-body';
  element.append(header, body);
  parent.append(element);
  let text = '';
  let table: CsvTable | null = null;
  // Body rows are the table's rows after the header: body row `i` is table row `i + 1`.
  let bodyCount = 0;
  // Where the last kept row ends: the line after it closes split's last range.
  let endLine = 1;
  let focusRow = 0;
  let focusColumn = 0;
  let drawn = new Map<number, HTMLElement>();
  let frame = 0;

  const gridTop = () => {
    const pane = scroller();
    return element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  };
  /** How many body rows are scrolled past, fractional. */
  const scrolled = () => Math.max(0, (scroller().scrollTop - gridTop()) / TABLE_ROW_HEIGHT);
  const lineOf = (row: number) => (row < table!.rows ? table!.rowLines[row]! : endLine);

  function columnHeader(text: string, index: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'galeo-csv-cell';
    item.setAttribute('role', 'columnheader');
    item.setAttribute('aria-colindex', String(index + 1));
    item.textContent = text;
    item.title = text;
    return item;
  }

  function row(index: number): HTMLElement {
    const existing = drawn.get(index);
    if (existing) return existing;
    const tableRow = index + 1;
    const item = document.createElement('div');
    item.className = 'galeo-csv-row';
    item.setAttribute('role', 'row');
    item.setAttribute('aria-rowindex', String(tableRow + 1));
    item.dataset['row'] = String(index);
    item.dataset['srcLine'] = String(table!.rowLines[tableRow]);
    const number = document.createElement('div');
    number.className = 'galeo-csv-cell galeo-csv-number';
    number.setAttribute('role', 'rowheader');
    number.setAttribute('aria-colindex', '1');
    number.textContent = String(tableRow);
    item.append(number);
    for (let column = 0; column < table!.columns; column++) {
      const value = cell(text, table!, tableRow, column) ?? '';
      const each = document.createElement('div');
      each.className = 'galeo-csv-cell';
      each.setAttribute('role', 'gridcell');
      each.setAttribute('aria-colindex', String(column + 2));
      each.dataset['column'] = String(column);
      each.textContent = value;
      if (value) each.title = value;
      item.append(each);
    }
    drawn.set(index, item);
    return item;
  }

  const cellAt = (index: number, column: number) => drawn.get(index)?.querySelectorAll<HTMLElement>('[role=gridcell]')[column];

  function draw() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!table) return;
    body.style.height = `${bodyCount * TABLE_ROW_HEIGHT}px`;
    const first = Math.max(0, Math.floor(scrolled()) - OVERSCAN);
    const last = Math.min(bodyCount, Math.ceil(scrolled() + scroller().clientHeight / TABLE_ROW_HEIGHT) + OVERSCAN);
    const wanted: number[] = [];
    if (focusRow < first) wanted.push(focusRow);
    for (let index = first; index < last; index++) wanted.push(index);
    if (focusRow >= last && focusRow < bodyCount) wanted.push(focusRow);
    const keep = new Set(wanted);
    for (const [index, item] of drawn) {
      if (keep.has(index)) continue;
      item.remove();
      drawn.delete(index);
    }
    // Rows already drawn keep their order, so only new ones are inserted: the focused cell's row is
    // never moved, and keeps focus.
    let cursor = body.firstElementChild;
    for (const index of wanted) {
      const item = row(index);
      item.style.top = `${index * TABLE_ROW_HEIGHT}px`;
      if (item === cursor) cursor = cursor.nextElementSibling;
      else body.insertBefore(item, cursor);
    }
    for (const [index, item] of drawn) {
      item.querySelectorAll<HTMLElement>('[role=gridcell]').forEach((each, column) => {
        each.tabIndex = index === focusRow && column === focusColumn ? 0 : -1;
      });
    }
  }

  const schedule = () => {
    frame ||= requestAnimationFrame(draw);
  };

  /** Moves focus to a cell, scrolling just enough to show its row under the header. */
  function focusCell(index: number, column: number) {
    if (!table || bodyCount === 0) return;
    focusRow = Math.min(bodyCount - 1, Math.max(0, index));
    focusColumn = Math.min(table.columns - 1, Math.max(0, column));
    const pane = scroller();
    const top = gridTop() + focusRow * TABLE_ROW_HEIGHT;
    // The header covers the first row's height at the top of the view.
    const visible = pane.clientHeight - TABLE_ROW_HEIGHT;
    if (top < pane.scrollTop) pane.scrollTop = top;
    else if (top + TABLE_ROW_HEIGHT > pane.scrollTop + visible) pane.scrollTop = top + TABLE_ROW_HEIGHT - visible;
    draw();
    cellAt(focusRow, focusColumn)?.focus({ preventScroll: true });
  }

  element.addEventListener('keydown', (event) => {
    if (!table || event.altKey || event.metaKey || event.shiftKey) return;
    const page = Math.max(1, Math.floor(scroller().clientHeight / TABLE_ROW_HEIGHT) - 2);
    const ctrl = event.ctrlKey;
    if (ctrl && event.key !== 'Home' && event.key !== 'End') return;
    switch (event.key) {
      case 'ArrowDown':
        focusCell(focusRow + 1, focusColumn);
        break;
      case 'ArrowUp':
        focusCell(focusRow - 1, focusColumn);
        break;
      case 'ArrowRight':
        focusCell(focusRow, focusColumn + 1);
        break;
      case 'ArrowLeft':
        focusCell(focusRow, focusColumn - 1);
        break;
      case 'PageDown':
        focusCell(focusRow + page, focusColumn);
        break;
      case 'PageUp':
        focusCell(focusRow - page, focusColumn);
        break;
      case 'Home':
        focusCell(ctrl ? 0 : focusRow, 0);
        break;
      case 'End':
        focusCell(ctrl ? bodyCount - 1 : focusRow, table.columns - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  element.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[role=gridcell]');
    const item = target?.closest<HTMLElement>('.galeo-csv-row');
    if (!target || !item) return;
    focusCell(Number(item.dataset['row']), Number(target.dataset['column']));
  });

  let listening: HTMLElement | null = null;
  const listen = () => {
    const pane = scroller();
    if (pane === listening) return;
    listening?.removeEventListener('scroll', schedule);
    pane.addEventListener('scroll', schedule, { passive: true });
    listening = pane;
  };

  const view: CsvTableView = {
    element,
    setTable(nextText, next) {
      text = nextText;
      table = next;
      bodyCount = Math.max(0, next.rows - 1);
      const last = next.rows - 1;
      // Only the last row's own line breaks are counted: its start line is known.
      endLine = last < 0 ? 2 : lineAt(text, next.rowStarts[last]!, next.rowLines[last]!, next.fieldEnds[next.rowFields[last + 1]! - 1]!) + 1;
      drawn = new Map();
      body.replaceChildren();
      element.setAttribute('aria-rowcount', String(next.rows));
      element.setAttribute('aria-colcount', String(next.columns + 1));
      // Widths from the first rows: the header and a sample of the data, in characters.
      const widths = Array.from({ length: next.columns }, (_, column) => {
        let longest = MIN_CHARS;
        for (let row = 0; row < Math.min(next.rows, SAMPLE_ROWS); row++) longest = Math.max(longest, (cell(text, next, row, column) ?? '').length);
        return Math.min(longest, MAX_CHARS);
      });
      const numberWidth = Math.max(2, String(bodyCount).length) + 1;
      element.style.setProperty('--galeo-csv-columns', [`${numberWidth}ch`, ...widths.map((chars) => `calc(${chars}ch + 1rem)`)].join(' '));
      header.replaceChildren(columnHeader('#', 0), ...widths.map((_, column) => columnHeader(next.rows > 0 ? (cell(text, next, 0, column) ?? '') : '', column + 1)));
      focusRow = Math.min(focusRow, Math.max(0, bodyCount - 1));
      focusColumn = Math.min(focusColumn, Math.max(0, next.columns - 1));
      listen();
      draw();
    },
    focus() {
      draw();
      cellAt(focusRow, focusColumn)?.focus({ preventScroll: true });
    },
    topLine() {
      if (!table) return 1;
      const pane = scroller();
      if (pane.scrollTop <= gridTop()) return table.rowLines[0] ?? 1;
      return lineOf(Math.min(table.rows - 1, Math.floor(scrolled()) + 1));
    },
    scrollToLine(line) {
      if (!table) return;
      const tableRow = Math.max(0, countAtMost(table.rowLines, line) - 1);
      scroller().scrollTop = gridTop() + Math.max(0, tableRow - 1) * TABLE_ROW_HEIGHT;
      draw();
    },
    topPosition() {
      if (!table || table.rows === 0) return 1;
      // Body row `i` is table row `i + 1`, spread over its lines up to the next row's.
      const at = scrolled() + 1;
      const row = Math.min(table.rows - 1, Math.floor(at));
      return lineOf(row) + Math.min(1, at - row) * (lineOf(row + 1) - lineOf(row));
    },
    scrollToPosition(line) {
      if (!table || table.rows === 0) return;
      const row = Math.min(table.rows - 1, Math.max(0, countAtMost(table.rowLines, line) - 1));
      const span = lineOf(row + 1) - lineOf(row);
      const at = row + (span > 0 ? Math.min(1, Math.max(0, (line - lineOf(row)) / span)) : 0);
      scroller().scrollTop = gridTop() + Math.max(0, at - 1) * TABLE_ROW_HEIGHT;
      draw();
    },
    flush: draw,
    dispose() {
      cancelAnimationFrame(frame);
      listening?.removeEventListener('scroll', schedule);
      element.remove();
    },
  };
  return view;
}
