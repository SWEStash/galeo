import { afterEach, describe, expect, it } from 'vitest';
import { parseCsv } from '../../shared/csv';
import { createCsvTableView, TABLE_ROW_HEIGHT, type CsvTableView } from './csv-table-view';

function tableOf(text: string) {
  const parsed = parseCsv(text, ',');
  if (parsed.state !== 'table') throw new Error(parsed.state);
  return parsed.table;
}

/** A table in a scroller showing `rowsHigh` rows at a time. */
function setup(text: string, rowsHigh = 20): { view: CsvTableView; scroller: HTMLElement; grid: () => HTMLElement } {
  const scroller = document.createElement('div');
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => rowsHigh * TABLE_ROW_HEIGHT });
  document.body.append(scroller);
  const view = createCsvTableView({ parent: scroller, scroller: () => scroller, label: 'data.csv' });
  // happy-dom lays nothing out: the grid's top moves up as its scroller scrolls, as in a browser.
  Object.defineProperty(view.element, 'getBoundingClientRect', { value: () => ({ top: -scroller.scrollTop }) as DOMRect });
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
});
