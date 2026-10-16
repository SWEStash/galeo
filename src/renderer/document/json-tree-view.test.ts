import { afterEach, describe, expect, it } from 'vitest';
import { indexJson } from '../../shared/json-index';
import { createTreeModel, type TreeModel } from './json-tree-model';
import { createJsonTreeView, ROW_HEIGHT, type JsonTreeView } from './json-tree-view';

function model(text: string): TreeModel {
  const parsed = indexJson(text);
  if (parsed.state !== 'tree') throw new Error(parsed.state);
  return createTreeModel(text, parsed.tree);
}

/** A tree in a scroller showing `rowsHigh` rows at a time. */
function setup(text: string, rowsHigh = 20): { view: JsonTreeView; scroller: HTMLElement; tree: () => HTMLElement } {
  const scroller = document.createElement('div');
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => rowsHigh * ROW_HEIGHT });
  document.body.append(scroller);
  const view = createJsonTreeView({ parent: scroller, scroller: () => scroller, label: 'data.json' });
  // happy-dom lays nothing out: the tree's top moves up as its scroller scrolls, as in a browser.
  Object.defineProperty(view.element, 'getBoundingClientRect', { value: () => ({ top: -scroller.scrollTop }) as DOMRect });
  view.setModel(model(text));
  return { view, scroller, tree: () => scroller.querySelector<HTMLElement>('[role=tree]')! };
}

const rows = (tree: HTMLElement) => [...tree.querySelectorAll<HTMLElement>('[role=treeitem]')];
const texts = (tree: HTMLElement) => rows(tree).map((row) => row.textContent?.replace(/^[▸▾]\s*/, '').trim());
const focused = () => (document.activeElement as HTMLElement | null)?.textContent?.replace(/^[▸▾]\s*/, '').trim();
const press = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

const SAMPLE = '{\n"a": [1, 2],\n"b": {"c": true},\n"d": null\n}';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('JSON tree view', () => {
  it('is an ARIA tree whose rows say their level, place among siblings and whether they are open', () => {
    const { tree } = setup(SAMPLE);
    expect(tree().getAttribute('aria-label')).toBe('data.json');
    const [root, a] = rows(tree());
    expect(root!.getAttribute('aria-level')).toBe('1');
    expect(root!.getAttribute('aria-expanded')).toBe('true');
    expect([a!.getAttribute('aria-level'), a!.getAttribute('aria-posinset'), a!.getAttribute('aria-setsize'), a!.getAttribute('aria-expanded')]).toEqual(['2', '1', '3', 'false']);
    expect(rows(tree())[3]!.hasAttribute('aria-expanded')).toBe(false);
    expect(texts(tree())).toEqual(['{3 keys}', 'a: [2 items]', 'b: {1 key}', 'd: null']);
  });

  it('has one row in the tab order, the first, until another takes focus', () => {
    const { tree } = setup(SAMPLE);
    expect(rows(tree()).map((row) => row.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it('moves between rows with the arrow keys, Home and End', () => {
    const { view } = setup(SAMPLE);
    view.focus();
    press('ArrowDown');
    press('ArrowDown');
    expect(focused()).toBe('b: {1 key}');
    press('ArrowUp');
    expect(focused()).toBe('a: [2 items]');
    press('End');
    expect(focused()).toBe('d: null');
    press('Home');
    expect(focused()).toBe('{3 keys}');
  });

  it('opens with →, then moves into the first child; ← closes, then moves to the parent', () => {
    const { view, tree } = setup(SAMPLE);
    view.focus();
    press('ArrowDown');
    press('ArrowRight');
    expect(texts(tree())).toContain('1');
    expect(focused()).toBe('a: [2 items]');
    press('ArrowRight');
    expect(focused()).toBe('1');
    press('ArrowLeft');
    expect(focused()).toBe('a: [2 items]');
    press('ArrowLeft');
    expect(texts(tree())).not.toContain('1');
    expect(focused()).toBe('a: [2 items]');
  });

  it('toggles a node with Enter, and with a click on its row', () => {
    const { view, tree } = setup(SAMPLE);
    view.focus();
    press('ArrowDown');
    press('Enter');
    expect(texts(tree())).toContain('1');
    rows(tree())[1]!.click();
    expect(texts(tree())).not.toContain('1');
  });

  it('expands and collapses everything', () => {
    const { view, tree } = setup(SAMPLE);
    view.expandAll();
    expect(texts(tree())).toEqual(['{3 keys}', 'a: [2 items]', '1', '2', 'b: {1 key}', 'c: true', 'd: null']);
    view.collapseAll();
    expect(texts(tree())).toHaveLength(4);
  });

  it('draws only the rows in view, and keeps the focused one wherever the view scrolls', () => {
    const text = `[${Array.from({ length: 1000 }, (_, i) => i).join(',\n')}]`;
    const { view, scroller, tree } = setup(text, 10);
    expect(rows(tree()).length).toBeLessThan(40);
    view.focus();
    scroller.scrollTop = 500 * ROW_HEIGHT;
    scroller.dispatchEvent(new Event('scroll'));
    view.flush();
    const shown = texts(tree());
    expect(shown).toContain('500');
    expect(shown).toContain('[1000 items]');
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('names its source line on each row, the line at its top, and scrolls a line into view', () => {
    const text = `[${Array.from({ length: 1000 }, (_, i) => i).join(',\n')}]`;
    const { view, scroller, tree } = setup(text, 10);
    expect(rows(tree())[1]!.dataset['srcLine']).toBe('1');
    view.scrollToLine(400);
    expect(scroller.scrollTop).toBe(400 * ROW_HEIGHT);
    expect(view.topLine()).toBe(400);
    view.flush();
    expect(texts(tree())).toContain('399');
  });

  it('opens what hides a line before scrolling to it', () => {
    const { view } = setup('{\n"a": {\n"b": 1\n}\n}');
    view.scrollToLine(3);
    expect(view.topLine()).toBe(3);
  });

  it('keeps the focused node and the top of the view, by path, in a new version of the document', () => {
    const text = (extra: string) => `[${extra}${Array.from({ length: 100 }, (_, i) => `{"n": ${i}}`).join(',\n')}]`;
    const { view, scroller } = setup(text(''), 10);
    view.scrollToLine(50);
    view.focus();
    const top = view.topNode();
    view.setModel(model(text('0,\n')));
    // $[49] is still $[49]: an index, not the object that moved down a line.
    expect(view.topLine()).toBe(50);
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(0);
  });
});
