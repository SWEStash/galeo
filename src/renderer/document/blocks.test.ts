import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockElements, measureBlocks, onFrameScroll } from './blocks';

afterEach(() => vi.restoreAllMocks());

function article(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('blockElements', () => {
  it('finds the rendered blocks that carry a source line, in document order', () => {
    const root = article('<p data-src-line="1">a</p><div><h2 data-src-line="3" id="b">b</h2></div><p>no line</p>');
    expect(blockElements(root).map((element) => element.textContent)).toEqual(['a', 'b']);
  });
});

describe('measureBlocks', () => {
  it('reads each block\'s lines and its box from the origin, and says whether it is laid out', () => {
    const root = article('<p data-src-line="2" data-src-end="4">a</p><details><p data-src-line="6">hidden</p></details>');
    const [shown, hidden] = blockElements(root);
    vi.spyOn(shown!, 'getBoundingClientRect').mockReturnValue({ top: 150, bottom: 190, width: 300, height: 40 } as DOMRect);
    vi.spyOn(hidden!, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 0, width: 0, height: 0 } as DOMRect);
    expect(measureBlocks(root, 100)).toEqual([
      { element: shown, line: 2, end: 4, top: 50, bottom: 90, laidOut: true },
      { element: hidden, line: 6, end: 6, top: -100, bottom: -100, laidOut: false },
    ]);
  });
});

describe('onFrameScroll', () => {
  it('updates once per frame however often the element scrolls, and stops when asked', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => frames.push(run));
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const element = document.createElement('div');
    const update = vi.fn();
    const stop = onFrameScroll(element, update);
    element.dispatchEvent(new Event('scroll'));
    element.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(1);
    frames[0]!(0);
    expect(update).toHaveBeenCalledOnce();
    element.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(2);
    stop();
    expect(cancel).toHaveBeenCalledWith(2);
    element.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(2);
  });
});
