import { findRanges, nextIndex } from './find-rendered';
import type { FindResult } from './source-view';

export interface Finder {
  find(query: string, options: { caseSensitive: boolean }): FindResult;
  step(direction: 1 | -1): FindResult;
  clear(): void;
}

// Highlight names; their `::highlight()` styles live in the document's shadow root (ADR-003).
const ALL = 'galeo-find';
const CURRENT = 'galeo-find-current';

function registry(): HighlightRegistry | null {
  return typeof Highlight === 'undefined' || typeof CSS === 'undefined' || !CSS.highlights ? null : CSS.highlights;
}

/** Find in the rendered view: matches highlighted in place, the current one centred in `scroller`. */
export function createRenderedFinder(article: HTMLElement, scroller: HTMLElement): Finder {
  let ranges: Range[] = [];
  let current = -1;

  const result = (): FindResult => ({ current: current + 1, total: ranges.length, capped: false });

  const paint = () => {
    const range = ranges[current];
    const highlights = registry();
    if (highlights) {
      highlights.set(ALL, new Highlight(...ranges));
      if (range) {
        // Above the other matches' highlight, so its colours win where the two overlap.
        const highlight = new Highlight(range);
        highlight.priority = 1;
        highlights.set(CURRENT, highlight);
      } else {
        highlights.delete(CURRENT);
      }
    }
    if (!range) return;
    // The current match goes to the middle of the view (UX F9).
    const box = range.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    scroller.scrollTop += box.top - view.top - (view.height - box.height) / 2;
  };

  return {
    find(query, { caseSensitive }) {
      ranges = findRanges(article, query, { caseSensitive });
      // Start from the reading position: the first match not above the view.
      const top = scroller.getBoundingClientRect().top;
      const visible = ranges.findIndex((range) => range.getBoundingClientRect().bottom >= top);
      current = ranges.length === 0 ? -1 : Math.max(visible, 0);
      paint();
      return result();
    },
    step(direction) {
      current = nextIndex(current, ranges.length, direction);
      paint();
      return result();
    },
    clear() {
      ranges = [];
      current = -1;
      registry()?.delete(ALL);
      registry()?.delete(CURRENT);
    },
  };
}
