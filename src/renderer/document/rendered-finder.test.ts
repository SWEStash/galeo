import { describe, expect, it } from 'vitest';
import { createRenderedFinder } from './rendered-finder';

describe('createRenderedFinder', () => {
  it('finds and steps even where the Custom Highlight API is missing', () => {
    expect(typeof (globalThis as { Highlight?: unknown }).Highlight).toBe('undefined');
    const article = document.createElement('article');
    article.innerHTML = '<p>plan one</p><p>plan two</p>';
    const scroller = document.createElement('div');
    scroller.append(article);
    document.body.append(scroller);
    const finder = createRenderedFinder(article, () => scroller);
    expect(finder.find('plan', { caseSensitive: false })).toEqual({ current: 1, total: 2, capped: false });
    expect(finder.step(1)).toEqual({ current: 2, total: 2, capped: false });
    finder.clear();
    scroller.remove();
  });

  it("starts at the rendered block holding a given source line, for a match found from another tab", () => {
    const article = document.createElement('article');
    article.innerHTML = '<p data-src-line="1">plan one</p><ul data-src-line="4"><li data-src-line="4">plan <em>two</em></li><li data-src-line="6">plan three</li></ul>';
    const scroller = document.createElement('div');
    scroller.append(article);
    document.body.append(scroller);
    const finder = createRenderedFinder(article, () => scroller);
    // Line 2 is inside the paragraph that starts on line 1; line 5 inside the item from line 4.
    expect(finder.find('plan', { caseSensitive: false, line: 2 }).current).toBe(1);
    expect(finder.find('plan', { caseSensitive: false, line: 5 }).current).toBe(2);
    expect(finder.find('plan', { caseSensitive: false, line: 6 }).current).toBe(3);
    finder.clear();
    scroller.remove();
  });
});
