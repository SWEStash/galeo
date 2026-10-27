// The CSV/TSV table view (ADR-018, UX F14): an ARIA grid that draws only the rows and columns in
// view, so a million rows or thousands of columns open and scroll like a few. Plain DOM inside the
// document's shadow root (ADR-006), like the JSON tree. The first row is the header and stays in
// view; one cell is in the tab order, and the focused one is always drawn, wherever the view scrolls.
import { cell, type CsvTable } from '../../shared/csv';
import { clamp } from '../../shared/math';
import { columnStarts, columnWindow, countAtMost, keyToMove, lineAt, positionAt, rowAtPosition, sampleWidths } from './table-geometry';

/** Every row is this tall (px), so a row's place is its index times this. */
export const TABLE_ROW_HEIGHT = 24;

/** Rows drawn beyond each edge of the view, so a scroll shows no gap before the next frame. */
const OVERSCAN = 10;

/** A cell shows at most this much of its text: laying out a megabyte in one cell would stall the page. */
const MAX_CELL_CHARS = 1000;

const clipped = (value: string) => (value.length > MAX_CELL_CHARS ? `${value.slice(0, MAX_CELL_CHARS)}…` : value);

export interface CsvTableView {
  readonly element: HTMLElement;
  /**
   * Shows a table; a new version of the text keeps the scroll and the focused cell, by index.
   * `header: false`: the columns are numbered and the first row is data (ADR-021).
   */
  setTable(text: string, table: CsvTable, options?: { header?: boolean }): void;
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

export function createCsvTableView({ parent, scroller, label }: { parent: HTMLElement; scroller: () => HTMLElement; label: string }): CsvTableView {
  const element = document.createElement('div');
  element.className = 'galeo-csv-table';
  element.setAttribute('role', 'grid');
  element.setAttribute('aria-label', label);
  const headerRow = document.createElement('div');
  headerRow.className = 'galeo-csv-header';
  headerRow.setAttribute('role', 'row');
  headerRow.setAttribute('aria-rowindex', '1');
  const body = document.createElement('div');
  body.className = 'galeo-csv-body';
  element.append(headerRow, body);
  parent.append(element);
  let text = '';
  let table: CsvTable | null = null;
  // Body rows are the table's rows after the header, if it has one: body row `i` is table row `i + first`.
  let first = 1;
  let bodyCount = 0;
  // Where the last kept row ends: the line after it closes split's last range.
  let endLine = 1;
  let focusRow = 0;
  let focusColumn = 0;
  let drawn = new Map<number, HTMLElement>();
  // The cells drawn in each drawn row (by body row), and in the header, by column.
  let drawnCells = new Map<number, Map<number, HTMLElement>>();
  const headerCells = new Map<number, HTMLElement>();
  let columnName: (column: number) => string = () => '';
  // Column `c` starts `starts[c]` characters plus `c` rem after the row number (each column, the
  // row number's too, is its width in characters plus 1rem of padding): CSS lengths, so zoom and
  // fonts keep them right.
  let numberChars = 2;
  let widths: number[] = [];
  let starts = new Float64Array(1);
  let frame = 0;
  // 100ch and 100rem wide, to measure both units in the table's font with one layout.
  const [chProbe, remProbe] = ['100ch', '100rem'].map((width) => {
    const probe = document.createElement('span');
    probe.className = 'galeo-csv-probe';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.width = width;
    element.append(probe);
    return probe;
  }) as [HTMLElement, HTMLElement];

  const gridTop = () => {
    const pane = scroller();
    return element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  };
  /** How many body rows are scrolled past, fractional. */
  const scrolled = () => Math.max(0, (scroller().scrollTop - gridTop()) / TABLE_ROW_HEIGHT);
  /** The source line a table row starts on; past the last row, the line after it. */
  const lineOf = (current: CsvTable, row: number) => (row < current.rows ? current.rowLines[row]! : endLine);
  const tableRowOf = (index: number) => index + first;

  const leftOf = (column: number) => `calc(${numberChars + starts[column]!}ch + ${column + 1}rem)`;
  const widthOf = (column: number) => `calc(${widths[column]!}ch + 1rem)`;
  /** One `ch` and one `rem`, in px, as the table's font draws them (a layout that measures nothing: 8 and 16). */
  const units = () => ({ ch: chProbe.getBoundingClientRect().width / 100 || 8, rem: remProbe.getBoundingClientRect().width / 100 || 16 });
  const pxLeftOf = (column: number, { ch, rem }: { ch: number; rem: number }) => (numberChars + starts[column]!) * ch + (column + 1) * rem;
  /** Where the table starts in its scroller's content, sideways. */
  const gridLeft = () => {
    const pane = scroller();
    return (element.getBoundingClientRect().left || 0) - (pane.getBoundingClientRect().left || 0) + pane.scrollLeft;
  };
  /** The columns in view, with a few beyond each side. */
  function columnsInView(current: CsvTable): [number, number] {
    if (current.columns === 0) return [0, 0];
    const size = units();
    const pane = scroller();
    const from = pane.scrollLeft - gridLeft();
    return columnWindow(current.columns, (column) => pxLeftOf(column, size), from, from + pane.clientWidth);
  }

  /** Puts `cells` (by column) in `parent` for the columns wanted: new ones made, others removed. */
  function syncCells(parent: HTMLElement, cells: Map<number, HTMLElement>, wanted: number[], make: (column: number) => HTMLElement) {
    const keep = new Set(wanted);
    for (const [column, item] of cells) {
      if (keep.has(column)) continue;
      item.remove();
      cells.delete(column);
    }
    for (const column of wanted) {
      if (cells.has(column)) continue;
      const item = make(column);
      item.style.left = leftOf(column);
      item.style.width = widthOf(column);
      cells.set(column, item);
      parent.append(item);
    }
  }

  function columnHeader(text: string, index: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'galeo-csv-cell';
    item.setAttribute('role', 'columnheader');
    item.setAttribute('aria-colindex', String(index + 1));
    item.textContent = clipped(text);
    item.title = clipped(text);
    return item;
  }

  function dataCell(current: CsvTable, tableRow: number, column: number): HTMLElement {
    const value = cell(text, current, tableRow, column) ?? '';
    const each = document.createElement('div');
    each.className = 'galeo-csv-cell';
    each.setAttribute('role', 'gridcell');
    each.setAttribute('aria-colindex', String(column + 2));
    each.dataset['column'] = String(column);
    each.tabIndex = -1;
    each.textContent = clipped(value);
    if (value) each.title = clipped(value);
    return each;
  }

  function row(current: CsvTable, index: number): HTMLElement {
    const existing = drawn.get(index);
    if (existing) return existing;
    const tableRow = index + first;
    const item = document.createElement('div');
    item.className = 'galeo-csv-row';
    item.setAttribute('role', 'row');
    item.setAttribute('aria-rowindex', String(index + 2));
    item.dataset['row'] = String(index);
    item.dataset['srcLine'] = String(current.rowLines[tableRow]);
    const number = document.createElement('div');
    number.className = 'galeo-csv-cell galeo-csv-number';
    number.setAttribute('role', 'rowheader');
    number.setAttribute('aria-colindex', '1');
    number.textContent = String(index + 1);
    number.style.left = '0';
    number.style.width = `calc(${numberChars}ch + 1rem)`;
    item.append(number);
    drawn.set(index, item);
    drawnCells.set(index, new Map());
    return item;
  }

  const cellAt = (index: number, column: number) => drawnCells.get(index)?.get(column);

  function draw() {
    cancelAnimationFrame(frame);
    frame = 0;
    const current = table;
    if (!current) return;
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
      drawnCells.delete(index);
    }
    const [start, end] = columnsInView(current);
    const columns = Array.from({ length: end - start }, (_, at) => start + at);
    syncCells(headerRow, headerCells, columns, (column) => columnHeader(columnName(column), column + 1));
    // Rows already drawn keep their order, so only new ones are inserted: the focused cell's row is
    // never moved, and keeps focus.
    let cursor = body.firstElementChild;
    for (const index of wanted) {
      const item = row(current, index);
      item.style.top = `${index * TABLE_ROW_HEIGHT}px`;
      if (item === cursor) cursor = cursor.nextElementSibling;
      else body.insertBefore(item, cursor);
    }
    for (const [index, item] of drawn) {
      const cells = drawnCells.get(index)!;
      // The focused cell stays drawn, wherever the view scrolls sideways.
      const wanted = index === focusRow && (focusColumn < start || focusColumn >= end) ? [...columns, focusColumn] : columns;
      syncCells(item, cells, wanted, (column) => dataCell(current, tableRowOf(index), column));
      for (const [column, each] of cells) each.tabIndex = index === focusRow && column === focusColumn ? 0 : -1;
    }
  }

  const schedule = () => {
    frame ||= requestAnimationFrame(draw);
  };

  /** Moves focus to a cell, scrolling just enough to show its row under the header. */
  function focusCell(index: number, column: number) {
    if (!table || bodyCount === 0) return;
    focusRow = clamp(index, 0, bodyCount - 1);
    focusColumn = clamp(column, 0, table.columns - 1);
    const pane = scroller();
    const top = gridTop() + focusRow * TABLE_ROW_HEIGHT;
    // The header covers the first row's height at the top of the view.
    const visible = pane.clientHeight - TABLE_ROW_HEIGHT;
    if (top < pane.scrollTop) pane.scrollTop = top;
    else if (top + TABLE_ROW_HEIGHT > pane.scrollTop + visible) pane.scrollTop = top + TABLE_ROW_HEIGHT - visible;
    // Sideways too, the cell whole in view (its left edge first, for a cell wider than the view).
    const size = units();
    const left = gridLeft() + pxLeftOf(focusColumn, size);
    const right = left + widths[focusColumn]! * size.ch + size.rem;
    if (right > pane.scrollLeft + pane.clientWidth) pane.scrollLeft = right - pane.clientWidth;
    if (left < pane.scrollLeft) pane.scrollLeft = left;
    draw();
    cellAt(focusRow, focusColumn)?.focus({ preventScroll: true });
  }

  element.addEventListener('keydown', (event) => {
    if (!table || event.altKey || event.metaKey || event.shiftKey) return;
    const page = Math.max(1, Math.floor(scroller().clientHeight / TABLE_ROW_HEIGHT) - 2);
    const move = keyToMove(event.key, event.ctrlKey, { row: focusRow, column: focusColumn }, { page, lastRow: bodyCount - 1, lastColumn: table.columns - 1 });
    if (!move) return;
    focusCell(move.row, move.column);
    event.preventDefault();
  });

  element.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[role=gridcell]');
    const item = target?.closest<HTMLElement>('.galeo-csv-row');
    if (!target || !item) return;
    focusCell(Number(item.dataset['row']), Number(target.dataset['column']));
  });

  // What scrolls the table changes with the view (the document, or split's own pane, ADR-014): the
  // table hears every scroll in its document, scroll events reaching the root in the capture phase.
  const root = element.getRootNode() as Document | ShadowRoot;
  const host = 'host' in root ? root.host : null;
  root.addEventListener('scroll', schedule, { capture: true, passive: true });
  host?.addEventListener('scroll', schedule, { passive: true });

  const view: CsvTableView = {
    element,
    setTable(nextText, next, { header = true } = {}) {
      text = nextText;
      table = next;
      first = header ? 1 : 0;
      bodyCount = Math.max(0, next.rows - first);
      const last = next.rows - 1;
      // Only the last row's own line breaks are counted: its start line is known.
      endLine = last < 0 ? 2 : lineAt(text, next.rowStarts[last]!, next.rowLines[last]!, next.fieldEnds[next.rowFields[last + 1]! - 1]!) + 1;
      drawn = new Map();
      drawnCells = new Map();
      body.replaceChildren();
      element.setAttribute('aria-rowcount', String(bodyCount + 1));
      element.setAttribute('aria-colcount', String(next.columns + 1));
      // Widths from the first rows: the header and a sample of the data, in characters.
      widths = sampleWidths(text, next);
      starts = columnStarts(widths);
      numberChars = Math.max(2, String(bodyCount).length) + 1;
      element.style.width = `calc(${numberChars + starts[next.columns]!}ch + ${next.columns + 1}rem)`;
      columnName = (column: number) => (!header ? String(column + 1) : next.rows > 0 ? (cell(text, next, 0, column) ?? '') : '');
      const corner = columnHeader('#', 0);
      corner.style.left = '0';
      corner.style.width = `calc(${numberChars}ch + 1rem)`;
      headerCells.clear();
      headerRow.replaceChildren(corner);
      focusRow = Math.min(focusRow, Math.max(0, bodyCount - 1));
      focusColumn = Math.min(focusColumn, Math.max(0, next.columns - 1));
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
      return lineOf(table, Math.min(table.rows - 1, Math.floor(scrolled()) + first));
    },
    scrollToLine(line) {
      if (!table) return;
      const tableRow = Math.max(0, countAtMost(table.rowLines, line) - 1);
      scroller().scrollTop = gridTop() + Math.max(0, tableRow - first) * TABLE_ROW_HEIGHT;
      draw();
    },
    topPosition() {
      const current = table;
      if (!current || current.rows === 0) return 1;
      // Body row `i` is table row `i + first`.
      return positionAt(scrolled() + first, current.rows, (row) => lineOf(current, row));
    },
    scrollToPosition(line) {
      const current = table;
      if (!current || current.rows === 0) return;
      const at = rowAtPosition(line, current.rowLines, current.rows, (row) => lineOf(current, row));
      scroller().scrollTop = gridTop() + Math.max(0, at - first) * TABLE_ROW_HEIGHT;
      draw();
    },
    flush: draw,
    dispose() {
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', schedule, { capture: true });
      host?.removeEventListener('scroll', schedule);
      element.remove();
    },
  };
  return view;
}
