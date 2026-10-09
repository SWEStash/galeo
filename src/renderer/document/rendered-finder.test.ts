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
});
