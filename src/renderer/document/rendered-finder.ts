import { blockAtOrBefore } from './anchor';
import { findRanges, nextIndex } from './find-rendered';
import type { FindOptions, FindResult } from './source-view';

export interface Finder {
  find(query: string, options: FindOptions): FindResult;
  step(direction: 1 | -1): FindResult;
  clear(): void;
}

// Highlight names; their `::highlight()` styles live in the document's shadow root (ADR-003).
const ALL = 'galeo-find';
const CURRENT = 'galeo-find-current';

function registry(): HighlightRegistry | null {
  return typeof Highlight === 'undefined' || typeof CSS === 'undefined' || !CSS.highlights ? null : CSS.highlights;
}

/** Find in the rendered view: matches highlighted in place, the current one centred in what scrolls it now. */
export function createRenderedFinder(article: HTMLElement, scrollerOf: () => HTMLElement): Finder {
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
    const scroller = scrollerOf();
    const view = scroller.getBoundingClientRect();
    scroller.scrollTop += box.top - view.top - (view.height - box.height) / 2;
  };

  return {
    find(query, { caseSensitive, line }) {
      ranges = findRanges(article, query, { caseSensitive });
      // Start from the block holding the given source line, else from the reading position: the
      // first match not above the view.
      const first = line === undefined ? firstInView(ranges, scrollerOf()) : firstFromLine(article, ranges, line);
      current = ranges.length === 0 ? -1 : Math.max(first, 0);
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

function firstInView(ranges: readonly Range[], scroller: HTMLElement): number {
  const top = scroller.getBoundingClientRect().top;
  return ranges.findIndex((range) => range.getBoundingClientRect().bottom >= top);
}

/** The first match in or after the rendered block that holds source `line`. */
function firstFromLine(article: HTMLElement, ranges: readonly Range[], line: number): number {
  const lineOf = (node: Node) => Number((node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-src-line]')?.dataset['srcLine'] ?? 0);
  const lines = [...article.querySelectorAll<HTMLElement>('[data-src-line]')].map((element) => Number(element.dataset['srcLine']));
  const block = lines[blockAtOrBefore(lines, line)] ?? 0;
  return ranges.findIndex((range) => lineOf(range.startContainer) >= block);
}
