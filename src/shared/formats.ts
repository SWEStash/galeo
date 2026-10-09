/** Document formats (ADR-003). `plain` is any other text file: source view only. */
export type FormatId = 'markdown' | 'mdx' | 'text' | 'log' | 'plain';

/** The formats the render worker draws: Markdown articles, with or without MDX. */
export type WorkerFormat = Extract<FormatId, 'markdown' | 'mdx'>;

/** The worker format a document renders as, or null when the page shows it without the worker. */
export function workerFormat(format: FormatId): WorkerFormat | null {
  return format === 'markdown' || format === 'mdx' ? format : null;
}

/** How a tab shows its document: the format's rendered view, the source view, or both side by side. */
export type ViewMode = 'rendered' | 'source' | 'split';

/** A split's narrowest pane, as a fraction of the width (ADR-014). */
export const SPLIT_MIN_RATIO = 0.2;
export const SPLIT_MAX_RATIO = 1 - SPLIT_MIN_RATIO;
