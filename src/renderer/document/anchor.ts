// Mapping reading positions between the rendered view and the source view through the
// `data-src-line` of rendered blocks (ADR-003), and keeping a tab's place across re-renders (ADR-002).
import type { ScrollAnchor } from '../../shared/tabs';
import { clamp01 } from '../../shared/math';

interface BlockBox {
  line: number;
  top: number;
  bottom: number;
}

/** The source line of the first block still visible at `viewportTop` (blocks in document order). */
export function firstVisibleLine(blocks: readonly BlockBox[], viewportTop: number): number {
  const visible = blocks.find((block) => block.bottom > viewportTop);
  return (visible ?? blocks.at(-1))?.line ?? 1;
}

/**
 * The index of the block to show for a source line: the one starting nearest at or before it
 * (nested blocks can appear out of line order), else the first block; -1 without blocks.
 */
export function blockAtOrBefore(lines: readonly number[], line: number): number {
  let best = -1;
  lines.forEach((start, index) => {
    if (start <= line && (best === -1 || start >= lines[best]!)) best = index;
  });
  return best === -1 && lines.length > 0 ? 0 : best;
}

/** A rendered block in scroll-content coordinates; `heading` is its id when it is a heading. */
export interface PlacedBlock extends BlockBox {
  heading: string | null;
}

/** The scroll container: how far down it is, how tall its content, how tall its viewport. */
interface ScrollState {
  top: number;
  height: number;
  viewport: number;
}

/** Where the reader is (ADR-002 scroll anchor), from the blocks in document order. */
export function anchorAt(blocks: readonly PlacedBlock[], scroll: ScrollState): ScrollAnchor {
  const block = blocks.find((each) => each.bottom > scroll.top) ?? blocks.at(-1);
  const heading = blocks.filter((each) => each.heading !== null && each.top <= scroll.top).at(-1)?.heading ?? null;
  const range = scroll.height - scroll.viewport;
  return {
    line: block?.line ?? 1,
    offset: block ? scroll.top - block.top : 0,
    heading,
    fraction: range > 0 ? clamp01(scroll.top / range) : 0,
  };
}

/** Where to scroll to be back at `anchor`: its block, else its heading, else as far down. */
export function scrollTopFor(
  anchor: ScrollAnchor,
  blocks: readonly PlacedBlock[],
  size: Omit<ScrollState, 'top'>,
): number {
  const block = blocks.find((each) => each.line === anchor.line);
  if (block) return block.top + Math.min(anchor.offset, block.bottom - block.top);
  const heading = anchor.heading && blocks.find((each) => each.heading === anchor.heading);
  if (heading) return heading.top;
  return anchor.fraction * Math.max(0, size.height - size.viewport);
}

/**
 * Where to scroll once the content was replaced by a new version of the file, so the reader stays
 * put: the heading above the view keeps its distance (its id survives edits elsewhere, where
 * source lines don't), else the block at the top does.
 */
export function keptTopFor(
  before: readonly PlacedBlock[],
  top: number,
  after: readonly PlacedBlock[],
  size: Omit<ScrollState, 'top'>,
): number {
  const heading = before.filter((each) => each.heading !== null && each.top <= top).at(-1);
  const same = heading && after.find((each) => each.heading === heading.heading);
  if (heading && same) return same.top + (top - heading.top);
  return scrollTopFor(anchorAt(before, { top, ...size }), after, size);
}

/** A heading scrolled to sits a few pixels under the top of the view (rounding, margins). */
const HEADING_SLACK_PX = 8;

/**
 * The heading being read: the last one at or above the top of the view; the first one before any
 * is reached (the document's top); null without headings.
 */
export function currentHeading(headings: readonly { id: string; top: number }[], viewportTop: number): string | null {
  let current = headings[0]?.id ?? null;
  for (const heading of headings) {
    if (heading.top > viewportTop + HEADING_SLACK_PX) break;
    current = heading.id;
  }
  return current;
}
