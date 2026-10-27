import type { RenderedContent } from './DocumentView';

/** A tree row's weight: its share of the worker's index and the model. */
const TREE_BYTES_PER_NODE = 48;

/**
 * What a tab's shown content weighs, for the warm-tab budget (ADR-002): text as UTF-16, a tree by
 * its nodes, a table by its text and offsets; `source` is the source view's text while it exists.
 */
export function contentWeight(rendered: RenderedContent | null, source: string | null): number {
  const renderedBytes = !rendered
    ? 0
    : 'tree' in rendered
      ? rendered.tree.nodes * TREE_BYTES_PER_NODE
      : 'table' in rendered
        ? 2 * rendered.source.length + 4 * (rendered.table.fieldEnds.length + 3 * rendered.table.rows)
        : 2 * ('html' in rendered ? rendered.html.length : rendered.text.length);
  return renderedBytes + (source === null ? 0 : 2 * source.length);
}
