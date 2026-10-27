/** The rendered blocks that carry their source lines (`data-src-line`, ADR-003), in document order. */
export function blockElements(article: ParentNode): HTMLElement[] {
  return [...article.querySelectorAll<HTMLElement>('[data-src-line]')];
}

/**
 * Each rendered block's first and last source line and its box, `origin` (a viewport y) taken off.
 * A block inside a closed `details` isn't laid out: it has no place on screen.
 */
export function measureBlocks(article: ParentNode, origin: number) {
  return blockElements(article).map((element) => {
    const box = element.getBoundingClientRect();
    const line = Number(element.dataset['srcLine']);
    return {
      element,
      line,
      end: Number(element.dataset['srcEnd'] ?? line),
      top: box.top - origin,
      bottom: box.bottom - origin,
      laidOut: box.width !== 0 || box.height !== 0,
    };
  });
}

/** Runs `update` at most once a frame while `element` scrolls; returns the stop. */
export function onFrameScroll(element: HTMLElement, update: () => void): () => void {
  let frame = 0;
  const onScroll = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };
  element.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    element.removeEventListener('scroll', onScroll);
  };
}
