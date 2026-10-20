import { afterEach, describe, expect, it } from 'vitest';
import { parseCsv } from '../../shared/csv';
import { createCsvTableView, TABLE_ROW_HEIGHT, type CsvTableView } from './csv-table-view';

function tableOf(text: string) {
  const parsed = parseCsv(text, ',');
  if (parsed.state !== 'table') throw new Error(parsed.state);
  return parsed.table;
}

/** A table in a scroller showing `rowsHigh` rows at a time, 800 px wide. */
function setup(text: string, rowsHigh = 20): { view: CsvTableView; scroller: HTMLElement; grid: () => HTMLElement } {
  const scroller = document.createElement('div');
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => rowsHigh * TABLE_ROW_HEIGHT });
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => 800 });
  document.body.append(scroller);
  const view = createCsvTableView({ parent: scroller, scroller: () => scroller, label: 'data.csv' });
  // happy-dom lays nothing out: the grid moves up and left as its scroller scrolls, as in a browser.
  Object.defineProperty(view.element, 'getBoundingClientRect', { value: () => ({ top: -scroller.scrollTop, left: -scroller.scrollLeft }) as DOMRect });
  view.setTable(text, tableOf(text));
  return { view, scroller, grid: () => scroller.querySelector<HTMLElement>('[role=grid]')! };
}

const bodyRows = (grid: HTMLElement) => [...grid.querySelectorAll<HTMLElement>('[role=row]')].filter((row) => row.querySelector('[role=gridcell]'));
const cells = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('[role=rowheader], [role=gridcell]')].map((cell) => cell.textContent);
const focused = () => document.activeElement as HTMLElement;
const press = (key: string, init: KeyboardEventInit = {}) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

const SAMPLE = 'name,qty,note\npear,3,"ripe, sweet"\nfig,12\n"multi\nline",1,x\n';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CSV table view', () => {
  it('is an ARIA grid: the header row, then each row numbered, ragged rows padded', () => {
    const { grid } = setup(SAMPLE);
    expect(grid().getAttribute('aria-label')).toBe('data.csv');
    expect(grid().getAttribute('aria-rowcount')).toBe('4');
    expect(grid().getAttribute('aria-colcount')).toBe('4');
    const header = grid().querySelector('[role=row]')!;
    expect([...header.querySelectorAll('[role=columnheader]')].map((cell) => cell.textContent)).toEqual(['#', 'name', 'qty', 'note']);
    expect(bodyRows(grid()).map(cells)).toEqual([
      ['1', 'pear', '3', 'ripe, sweet'],
      ['2', 'fig', '12', ''],
      ['3', 'multi\nline', '1', 'x'],
    ]);
    expect(bodyRows(grid()).map((row) => row.getAttribute('aria-rowindex'))).toEqual(['2', '3', '4']);
  });

  it('without a header row, numbers the columns and shows the first row as data (ADR-021)', () => {
    const { view, grid } = setup(SAMPLE);
    view.setTable(SAMPLE, tableOf(SAMPLE), { header: false });
    expect([...grid().querySelectorAll('[role=columnheader]')].map((cell) => cell.textContent)).toEqual(['#', '1', '2', '3']);
    expect(bodyRows(grid()).map(cells)[0]).toEqual(['1', 'name', 'qty', 'note']);
    expect(bodyRows(grid())).toHaveLength(4);
    expect(grid().getAttribute('aria-rowcount')).toBe('5');
    expect(bodyRows(grid()).map((row) => row.dataset['srcLine'])).toEqual(['1', '2', '3', '4']);
  });

  it('gives each cell its full value as a tooltip', () => {
    const { grid } = setup(SAMPLE);
    expect(bodyRows(grid())[0]!.querySelectorAll('[role=gridcell]')[2]!.getAttribute('title')).toBe('ripe, sweet');
  });

  it('has one cell in the tab order, the first, and moves between cells with the arrow keys', () => {
    const { view, grid } = setup(SAMPLE);
    expect([...grid().querySelectorAll<HTMLElement>('[role=gridcell]')].filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    view.focus();
    expect(focused().textContent).toBe('pear');
    press('ArrowRight');
    expect(focused().textContent).toBe('3');
    press('ArrowDown');
    expect(focused().textContent).toBe('12');
    press('ArrowRight');
    press('ArrowRight');
    expect(focused().textContent).toBe('');
    press('ArrowLeft');
    press('ArrowUp');
    expect(focused().textContent).toBe('3');
  });

  it('goes to the ends of a row with Home and End, and of the table with Ctrl', () => {
    const { view } = setup(SAMPLE);
    view.focus();
    press('End');
    expect(focused().textContent).toBe('ripe, sweet');
    press('Home');
    expect(focused().textContent).toBe('pear');
    press('End', { ctrlKey: true });
    expect(focused().textContent).toBe('x');
    press('Home', { ctrlKey: true });
    expect(focused().textContent).toBe('pear');
  });

  it('draws only the rows in view, and keeps the focused one wherever the view scrolls', () => {
    const text = `n\n${Array.from({ length: 5000 }, (_, i) => i).join('\n')}\n`;
    const { view, scroller, grid } = setup(text, 10);
    expect(bodyRows(grid()).length).toBeLessThan(40);
    view.focus();
    scroller.scrollTop = 3000 * TABLE_ROW_HEIGHT;
    scroller.dispatchEvent(new Event('scroll'));
    view.flush();
    const shown = bodyRows(grid()).map((row) => cells(row)[1]);
    expect(shown).toContain('3000');
    expect(shown).toContain('0');
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('redraws as whatever scrolls it scrolls: the view can move to a pane of its own (split)', () => {
    const text = `n\n${Array.from({ length: 5000 }, (_, i) => i).join('\n')}\n`;
    const first = document.createElement('div');
    const pane = document.createElement('div');
    for (const each of [first, pane]) Object.defineProperty(each, 'clientHeight', { configurable: true, get: () => 10 * TABLE_ROW_HEIGHT });
    pane.append(first);
    document.body.append(pane);
    let current = first;
    const view = createCsvTableView({ parent: first, scroller: () => current, label: 'x' });
    Object.defineProperty(view.element, 'getBoundingClientRect', { value: () => ({ top: -current.scrollTop }) as DOMRect });
    view.setTable(text, tableOf(text));
    current = pane;
    pane.scrollTop = 3000 * TABLE_ROW_HEIGHT;
    pane.dispatchEvent(new Event('scroll'));
    return new Promise<void>((done) =>
      requestAnimationFrame(() => {
        expect(bodyRows(view.element).map((row) => cells(row)[1])).toContain('3000');
        done();
      }),
    );
  });

  it("names each row's source line, the line at the top of the view, and scrolls a line into view", () => {
    const { view, scroller, grid } = setup(SAMPLE, 1);
    expect(bodyRows(grid()).map((row) => row.dataset['srcLine'])).toEqual(['2', '3', '4']);
    view.scrollToLine(5);
    expect(scroller.scrollTop).toBe(2 * TABLE_ROW_HEIGHT);
    expect(view.topLine()).toBe(4);
    view.scrollToLine(1);
    expect(view.topLine()).toBe(1);
  });

  it('places fractional lines for split scrolling, both ways', () => {
    const { view, scroller } = setup(SAMPLE, 1);
    view.scrollToPosition(4.5);
    expect(scroller.scrollTop).toBe(2.25 * TABLE_ROW_HEIGHT);
    expect(view.topPosition()).toBeCloseTo(4.5);
  });

  it('keeps the top row and the focused cell in a new version of the text', () => {
    const text = (rows: number) => `n\n${Array.from({ length: rows }, (_, i) => i).join('\n')}\n`;
    const { view, scroller } = setup(text(100), 10);
    scroller.scrollTop = 40 * TABLE_ROW_HEIGHT;
    view.setTable(text(120), tableOf(text(120)));
    expect(scroller.scrollTop).toBe(40 * TABLE_ROW_HEIGHT);
  });

  describe('a wide table', () => {
    // 5,000 columns: each at least 4 characters wide (happy-dom measures nothing: 8 px a character).
    const wide = (rows: number) =>
      [Array.from({ length: 5000 }, (_, i) => `c${i}`).join(','), ...Array.from({ length: rows }, (_, r) => Array.from({ length: 5000 }, (_, i) => `${r}.${i}`).join(','))].join('\n') + '\n';
    const columnsOf = (row: Element) => [...row.querySelectorAll<HTMLElement>('[role=gridcell], [role=columnheader]')].map((cell) => Number(cell.getAttribute('aria-colindex')));

    it('draws only the columns in view, in the header and in each row, and counts them all', () => {
      const { grid } = setup(wide(3));
      expect(grid().getAttribute('aria-colcount')).toBe('5001');
      const header = grid().querySelector('.galeo-csv-header')!;
      expect(columnsOf(header).length).toBeLessThan(60);
      expect(columnsOf(header).slice(0, 3)).toEqual([1, 2, 3]);
      for (const row of bodyRows(grid())) expect(columnsOf(row).length).toBeLessThan(60);
    });

    it('draws the columns a sideways scroll brings into view', () => {
      const { view, scroller, grid } = setup(wide(3));
      // Most of the way across (columns are 6 characters and 1rem: 64 px).
      scroller.scrollLeft = 3000 * 64;
      scroller.dispatchEvent(new Event('scroll'));
      view.flush();
      // Row 1: row 0 also keeps the focused cell, in column 1.
      const shown = columnsOf(bodyRows(grid())[1]!);
      expect(Math.min(...shown)).toBeGreaterThan(2900);
      expect(Math.max(...shown) - Math.min(...shown)).toBeLessThan(60);
      expect(shown.length).toBeLessThan(60);
    });

    it('goes to the last column with End, and keeps the focused cell while the view scrolls away', () => {
      const { view, scroller } = setup(wide(3));
      view.focus();
      press('End');
      expect(focused().getAttribute('aria-colindex')).toBe('5001');
      expect(focused().textContent).toBe('0.4999');
      expect(scroller.scrollLeft).toBeGreaterThan(0);
      scroller.scrollLeft = 0;
      scroller.dispatchEvent(new Event('scroll'));
      view.flush();
      expect(document.activeElement?.isConnected).toBe(true);
      expect(focused().getAttribute('aria-colindex')).toBe('5001');
      press('ArrowLeft');
      expect(focused().textContent).toBe('0.4998');
    });
  });

  it('shows at most 1,000 characters of a cell, and says it is cut', () => {
    const long = 'x'.repeat(5000);
    const { grid } = setup(`a\n${long}\n`);
    const shown = bodyRows(grid())[0]!.querySelector('[role=gridcell]')!;
    expect(shown.textContent).toBe(`${'x'.repeat(1000)}…`);
    expect(shown.getAttribute('title')).toBe(`${'x'.repeat(1000)}…`);
  });
});
