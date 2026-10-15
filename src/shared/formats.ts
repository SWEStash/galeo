/** Document formats (ADR-003, ADR-018). `plain` is any other text file: source view only. */
export type FormatId = 'markdown' | 'mdx' | 'text' | 'log' | 'json' | 'jsonl' | 'yaml' | 'toml' | 'csv' | 'tsv' | 'code' | 'plain';

/** What a format's tab can show and do: the shared part of its descriptor (ADR-018). */
export interface FormatViews {
  /** Who draws the rendered view: the render worker, the page itself, or nobody (source only). */
  rendered: 'worker' | 'host' | 'none';
  /** The rendered view is reader text (`.txt`): the status bar calls it "Reader". */
  reader: boolean;
  split: boolean;
  outline: boolean;
  follow: boolean;
  editable: boolean;
}

const SOURCE_ONLY: FormatViews = { rendered: 'none', reader: false, split: false, outline: false, follow: false, editable: true };
const ARTICLE: FormatViews = { rendered: 'worker', reader: false, split: true, outline: true, follow: false, editable: true };

export const FORMAT_VIEWS: Readonly<Record<FormatId, FormatViews>> = {
  markdown: ARTICLE,
  mdx: ARTICLE,
  text: { ...SOURCE_ONLY, rendered: 'host', reader: true },
  log: { ...SOURCE_ONLY, follow: true },
  json: SOURCE_ONLY,
  jsonl: SOURCE_ONLY,
  yaml: SOURCE_ONLY,
  toml: SOURCE_ONLY,
  csv: SOURCE_ONLY,
  tsv: SOURCE_ONLY,
  code: SOURCE_ONLY,
  plain: SOURCE_ONLY,
};

/** The formats the render worker draws: Markdown articles, with or without MDX. */
export type WorkerFormat = Extract<FormatId, 'markdown' | 'mdx'>;

/** The worker format a document renders as, or null when the page shows it without the worker. */
export function workerFormat(format: FormatId): WorkerFormat | null {
  return FORMAT_VIEWS[format].rendered === 'worker' ? (format as WorkerFormat) : null;
}

/** How a tab shows its document: the format's rendered view, the source view, or both side by side. */
export type ViewMode = 'rendered' | 'source' | 'split';

/** A split's narrowest pane, as a fraction of the width (ADR-014). */
export const SPLIT_MIN_RATIO = 0.2;
export const SPLIT_MAX_RATIO = 1 - SPLIT_MIN_RATIO;
