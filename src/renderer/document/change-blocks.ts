import { blockElements } from './blocks';
import type { ChangedRanges } from './change-ranges';

const CHANGED = 'galeo-changed';
const REMOVED_BEFORE = 'galeo-removed-before';
const REMOVED_AFTER = 'galeo-removed-after';
/** Below this many blocks, a document mostly changed is still worth marking block by block. */
const MOST_CHANGED_MIN_BLOCKS = 10;

const linesOf = (element: HTMLElement): [number, number] => {
  const line = Number(element.dataset['srcLine']);
  return [line, Number(element.dataset['srcEnd'] ?? line)];
};
const overlaps = (element: HTMLElement, [from, to]: [number, number]) => {
  const [line, end] = linesOf(element);
  return line <= to && end >= from;
};

/**
 * Marks the rendered blocks a change touched (ADR-030): for each changed range, the innermost
 * positioned block over it (a paragraph in an item, a row in a table), and the block a removal sat
 * before (or the last block, for one at the end). Returns them in document order, for F7. Over half
 * of a document of ten blocks or more marks nothing: it says most of the document changed instead.
 */
export function markBlocks(article: HTMLElement, ranges: ChangedRanges): { marks: HTMLElement[]; mostChanged: boolean } {
  clearBlockMarks(article);
  const blocks = blockElements(article);
  // Each block's nearest positioned ancestor: one walk instead of a search inside every block.
  const parentBlock = (block: HTMLElement) => block.parentElement?.closest<HTMLElement>('[data-src-line]') ?? null;
  const parents = new Set(blocks.map(parentBlock).filter((parent) => parent !== null));
  const changed = new Set<HTMLElement>();
  for (const range of ranges.changed) {
    const touched = blocks.filter((block) => overlaps(block, range));
    const outer = new Set(touched.map(parentBlock));
    for (const block of touched) if (!outer.has(block)) changed.add(block);
  }
  const leaves = blocks.filter((block) => !parents.has(block));
  if (leaves.length >= MOST_CHANGED_MIN_BLOCKS && changed.size > leaves.length / 2) return { marks: [], mostChanged: true };

  const before = new Set<HTMLElement>();
  const after = new Set<HTMLElement>();
  for (const line of ranges.removedAt) {
    const following = blocks.filter((block) => linesOf(block)[0] >= line);
    const first = Math.min(...following.map((block) => linesOf(block)[0]));
    // The deepest block starting on that line: blocks come in document order, parents first.
    const target = following.filter((block) => linesOf(block)[0] === first).at(-1);
    if (target) before.add(target);
    else if (blocks.length) after.add(blocks.at(-1)!);
  }

  const marks = blocks.filter((block) => changed.has(block) || before.has(block) || after.has(block));
  for (const block of marks) {
    const words = [];
    if (changed.has(block)) words.push('changed');
    if (before.has(block)) words.push('text removed before this');
    if (after.has(block)) words.push('text removed after this');
    block.classList.toggle(CHANGED, changed.has(block));
    block.classList.toggle(REMOVED_BEFORE, before.has(block));
    block.classList.toggle(REMOVED_AFTER, after.has(block));
    block.setAttribute('aria-description', words.join(', '));
  }
  return { marks, mostChanged: false };
}

export function clearBlockMarks(article: HTMLElement): void {
  for (const block of article.querySelectorAll<HTMLElement>(`.${CHANGED}, .${REMOVED_BEFORE}, .${REMOVED_AFTER}`)) {
    block.classList.remove(CHANGED, REMOVED_BEFORE, REMOVED_AFTER);
    block.removeAttribute('aria-description');
  }
}
