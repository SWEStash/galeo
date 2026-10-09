// Split view's scroll sync (ADR-014): both panes meet on a source line, fractional inside a block,
// through the rendered blocks' `data-src-line` and `data-src-end`.

/** A rendered block: its first and last source lines, and where it sits in its pane's content. */
export interface SyncBlock {
  line: number;
  end: number;
  top: number;
  bottom: number;
}

/** The innermost of the blocks `holds` accepts: nested blocks (a quote's paragraph) are more precise. */
function innermost(blocks: readonly SyncBlock[], holds: (block: SyncBlock) => boolean, size: (block: SyncBlock) => number): SyncBlock | undefined {
  let best: SyncBlock | undefined;
  for (const block of blocks) if (holds(block) && (!best || size(block) < size(best))) best = block;
  return best;
}

/** The source line at `offset` down the content: a block's lines spread over its height, and the lines between blocks over the gap. */
export function lineAtOffset(blocks: readonly SyncBlock[], offset: number): number {
  const inside = innermost(blocks, (block) => block.top <= offset && offset < block.bottom, (block) => block.bottom - block.top);
  if (inside) return inside.line + ((offset - inside.top) / (inside.bottom - inside.top)) * (inside.end + 1 - inside.line);
  let before: SyncBlock | undefined;
  let after: SyncBlock | undefined;
  for (const block of blocks) {
    if (block.bottom <= offset && (!before || block.bottom > before.bottom)) before = block;
    if (block.top > offset && (!after || block.top < after.top || (block.top === after.top && block.line < after.line))) after = block;
  }
  const from = before ? { line: before.end + 1, at: before.bottom } : { line: 1, at: 0 };
  if (!after) return from.line;
  return from.line + ((offset - from.at) / (after.top - from.at)) * (after.line - from.line);
}

/** Where source line `line` (fractional) sits down the content: the inverse of `lineAtOffset`. */
export function offsetOfLine(blocks: readonly SyncBlock[], line: number): number {
  const at = Math.max(1, line);
  const inside = innermost(blocks, (block) => block.line <= at && at < block.end + 1, (block) => block.end - block.line);
  if (inside) return inside.top + ((at - inside.line) / (inside.end + 1 - inside.line)) * (inside.bottom - inside.top);
  let before: SyncBlock | undefined;
  let after: SyncBlock | undefined;
  for (const block of blocks) {
    if (block.end + 1 <= at && (!before || block.end > before.end || (block.end === before.end && block.bottom > before.bottom))) before = block;
    if (block.line > at && (!after || block.line < after.line || (block.line === after.line && block.top < after.top))) after = block;
  }
  const from = before ? { line: before.end + 1, at: before.bottom } : { line: 1, at: 0 };
  if (!after) return from.at;
  return from.at + ((at - from.line) / (after.line - from.line)) * (after.top - from.at);
}

/** One side of a split, as scroll sync sees it. */
export interface SyncPane {
  readonly scroller: HTMLElement;
  /** The source line at the top of the pane, fractional inside a block. */
  position(): number;
  /** Scrolls the pane to put `line` at its top. */
  scrollTo(line: number): void;
}

/** Input that means the reader is scrolling this pane themselves. */
const READER_INPUT = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;

/** How many frames a follower's own scroll events are ignored after it is moved. */
const SETTLE_FRAMES = 2;

/**
 * Keeps the panes on the same source line: the pane that scrolls leads, and the other follows on the
 * next frame. A follower's own scroll events are ignored while it settles, so the two never drive
 * each other in a loop; the reader acting on it (wheel, pointer, keys) makes it lead at once.
 */
export function syncScrolling(
  panes: { source: SyncPane; rendered: SyncPane },
  schedule: (run: () => void) => unknown = requestAnimationFrame,
): () => void {
  const following = new Set<SyncPane>();
  let leader: SyncPane | null = null;
  let pending = false;
  const other = (pane: SyncPane) => (pane === panes.source ? panes.rendered : panes.source);

  const settle = (pane: SyncPane, frames: number) => {
    if (!following.has(pane)) return;
    if (frames === 0) following.delete(pane);
    else schedule(() => settle(pane, frames - 1));
  };
  const follow = () => {
    pending = false;
    if (!leader) return;
    const follower = other(leader);
    following.add(follower);
    follower.scrollTo(leader.position());
    settle(follower, SETTLE_FRAMES);
  };
  const stops = [panes.source, panes.rendered].flatMap((pane) => {
    const onScroll = () => {
      if (following.has(pane)) return;
      leader = pane;
      if (!pending) {
        pending = true;
        schedule(follow);
      }
    };
    const onInput = () => following.delete(pane);
    pane.scroller.addEventListener('scroll', onScroll, { passive: true });
    for (const type of READER_INPUT) pane.scroller.addEventListener(type, onInput, { passive: true });
    return [
      () => {
        pane.scroller.removeEventListener('scroll', onScroll);
        for (const type of READER_INPUT) pane.scroller.removeEventListener(type, onInput);
      },
    ];
  });
  return () => {
    leader = null;
    for (const stop of stops) stop();
  };
}
