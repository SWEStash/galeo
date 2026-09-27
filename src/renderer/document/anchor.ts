// Mapping reading positions between the rendered view and the source view through the
// `data-src-line` of rendered blocks (ADR-003).

export interface BlockBox {
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
