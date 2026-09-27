import { describe, expect, it } from 'vitest';
import { findRanges, nextIndex } from './find-rendered';

function article(html: string): HTMLElement {
  const element = document.createElement('article');
  element.innerHTML = html;
  return element;
}

const texts = (ranges: Range[]) => ranges.map((range) => range.toString());

describe('findRanges', () => {
  it('finds every match in document order, ignoring case by default', () => {
    const root = article('<h1>Plan</h1><p>The plan is a PLAN.</p>');
    expect(texts(findRanges(root, 'plan', { caseSensitive: false }))).toEqual(['Plan', 'plan', 'PLAN']);
  });

  it('matches case when asked', () => {
    const root = article('<p>Plan plan PLAN</p>');
    expect(texts(findRanges(root, 'plan', { caseSensitive: true }))).toEqual(['plan']);
  });

  it('finds matches that cross inline elements', () => {
    const root = article('<p>foo <strong>bar</strong> baz</p>');
    const [range] = findRanges(root, 'o ba', { caseSensitive: false });
    expect(range?.toString()).toBe('o ba');
    expect(range?.startContainer.textContent).toBe('foo ');
    expect(range?.endContainer.textContent).toBe('bar');
  });

  it('treats the query as text, not a pattern', () => {
    const root = article('<p>a.b a+b (a)</p>');
    expect(texts(findRanges(root, 'a+b', { caseSensitive: false }))).toEqual(['a+b']);
    expect(texts(findRanges(root, '(a)', { caseSensitive: false }))).toEqual(['(a)']);
  });

  it('finds nothing for an empty query, and does not overlap matches', () => {
    const root = article('<p>aaaa</p>');
    expect(findRanges(root, '', { caseSensitive: false })).toEqual([]);
    expect(texts(findRanges(root, 'aa', { caseSensitive: false }))).toEqual(['aa', 'aa']);
  });

  it('skips text hidden from readers, like the footnote heading for screen readers', () => {
    const root = article('<h2 class="sr-only">Footnotes</h2><p>Footnotes matter</p>');
    expect(findRanges(root, 'footnotes', { caseSensitive: false })).toHaveLength(1);
  });
});

describe('nextIndex', () => {
  it('steps forward and back, wrapping around', () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
    expect(nextIndex(-1, 3, 1)).toBe(0);
    expect(nextIndex(-1, 3, -1)).toBe(2);
    expect(nextIndex(0, 0, 1)).toBe(-1);
  });
});
