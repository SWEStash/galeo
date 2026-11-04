import { afterEach, describe, expect, it } from 'vitest';
import { clearBlockMarks, markBlocks } from './change-blocks';

afterEach(() => {
  document.body.innerHTML = '';
});

/** An article like the pipeline's: positioned blocks carry their first and last source lines. */
function article(html: string): HTMLElement {
  const element = document.createElement('article');
  element.innerHTML = html;
  document.body.append(element);
  return element;
}
const at = (from: number, to = from) => `data-src-line="${from}" data-src-end="${to}"`;
const marked = (root: HTMLElement) => [...root.querySelectorAll('.galeo-changed')].map((element) => element.id);

describe('markBlocks', () => {
  it('marks the blocks whose lines changed, in document order, and says so to screen readers', () => {
    const root = article(`<h1 id="h" ${at(1)}>T</h1><p id="p1" ${at(3, 4)}>a</p><p id="p2" ${at(6)}>b</p>`);
    const { marks } = markBlocks(root, { changed: [[4, 4], [6, 6]], removedAt: [] });
    expect(marks.map((element: HTMLElement) => element.id)).toEqual(['p1', 'p2']);
    expect(marked(root)).toEqual(['p1', 'p2']);
    expect(root.querySelector('#p1')!.getAttribute('aria-description')).toBe('changed');
    expect(root.querySelector('#h')!.hasAttribute('aria-description')).toBe(false);
  });

  it('marks the innermost block: a paragraph in an item, a row in a table, not their parents', () => {
    const root = article(
      `<ul><li id="li" ${at(1, 3)}><p id="lp" ${at(1)}>a</p><p id="lq" ${at(3)}>b</p></li></ul>` +
        `<table id="t" ${at(5, 8)}><tr id="r1" ${at(5)}><td>x</td></tr><tr id="r2" ${at(7)}><td>y</td></tr></table>`,
    );
    markBlocks(root, { changed: [[3, 3], [7, 7]], removedAt: [] });
    expect(marked(root)).toEqual(['lq', 'r2']);
  });

  it('marks the block after removed lines, or the last block when the end was removed', () => {
    const root = article(`<p id="a" ${at(1)}>a</p><p id="b" ${at(3)}>b</p>`);
    const { marks } = markBlocks(root, { changed: [], removedAt: [2, 9] });
    expect(root.querySelector('#b')!.classList.contains('galeo-removed-before')).toBe(true);
    expect(root.querySelector('#b')!.getAttribute('aria-description')).toBe('text removed before this, text removed after this');
    expect(root.querySelector('#b')!.classList.contains('galeo-removed-after')).toBe(true);
    expect(marks.map((element: HTMLElement) => element.id)).toEqual(['b']);
  });

  it('marks nothing and says most changed when over half of ten or more blocks would be marked', () => {
    const root = article(Array.from({ length: 10 }, (_, n) => `<p id="p${n}" ${at(n * 2 + 1)}>x</p>`).join(''));
    expect(markBlocks(root, { changed: [[1, 11]], removedAt: [] })).toEqual({ marks: [], mostChanged: true });
    expect(marked(root)).toEqual([]);
    expect(markBlocks(root, { changed: [[1, 9]], removedAt: [] }).mostChanged).toBe(false);
  });

  it('still marks most of a small document', () => {
    const root = article(`<p id="a" ${at(1)}>a</p><p id="b" ${at(3)}>b</p><p id="c" ${at(5)}>c</p>`);
    expect(markBlocks(root, { changed: [[1, 3]], removedAt: [] }).marks).toHaveLength(2);
  });

  it('clears the marks of a previous call, and on request', () => {
    const root = article(`<p id="a" ${at(1)}>a</p><p id="b" ${at(3)}>b</p>`);
    markBlocks(root, { changed: [[1, 1]], removedAt: [3] });
    markBlocks(root, { changed: [[3, 3]], removedAt: [] });
    expect(marked(root)).toEqual(['b']);
    expect(root.querySelector('.galeo-removed-before')).toBeNull();
    clearBlockMarks(root);
    expect(marked(root)).toEqual([]);
    expect(root.querySelector('[aria-description]')).toBeNull();
  });
});
