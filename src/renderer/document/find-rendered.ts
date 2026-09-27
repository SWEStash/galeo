// Find in the rendered view (ADR-003): text nodes walked with a TreeWalker, matches highlighted
// with the CSS Custom Highlight API, so neither the document nor the app UI is modified.

/** Text a reader never sees, which find must not land on. */
const HIDDEN = '.sr-only, .katex-mathml, [hidden]';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every match of `query` under `root`, in document order, as ranges that may span elements. */
export function findRanges(root: Node, query: string, { caseSensitive }: { caseSensitive: boolean }): Range[] {
  if (!query) return [];
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(HIDDEN) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += node.nodeValue ?? '';
  }

  // Maps an offset in the joined text back to a text node; `end` picks the node the offset ends.
  const locate = (offset: number, end: boolean) => {
    let low = 0;
    let high = nodes.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid]! < offset || (!end && starts[mid] === offset)) low = mid;
      else high = mid - 1;
    }
    return { node: nodes[low]!, offset: offset - starts[low]! };
  };

  const ranges: Range[] = [];
  const pattern = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
  for (const match of text.matchAll(pattern)) {
    const start = locate(match.index, false);
    const end = locate(match.index + match[0].length, true);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
  }
  return ranges;
}

/** The match after (or before) `current`, wrapping around; -1 when there are none. */
export function nextIndex(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}
