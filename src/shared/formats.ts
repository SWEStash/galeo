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
  yaml: { ...SOURCE_ONLY, outline: true },
  toml: { ...SOURCE_ONLY, outline: true },
  csv: SOURCE_ONLY,
  tsv: SOURCE_ONLY,
  code: SOURCE_ONLY,
  plain: SOURCE_ONLY,
};

/**
 * Source code by file name (ADR-018): lower-case extensions (with the dot) and whole names, each with
 * its language's name in `@codemirror/language-data`, or null to show it as plain source. Detection
 * takes the keys; the page loads the grammar.
 */
export const CODE_LANGUAGES: Readonly<Record<string, string | null>> = {
  '.ts': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript', '.tsx': 'TSX',
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JSX',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell', '.fish': null,
  '.c': 'C', '.h': 'C', '.cc': 'C++', '.cpp': 'C++', '.hpp': 'C++', '.cs': 'C#', '.java': 'Java',
  '.kt': 'Kotlin', '.kts': 'Kotlin', '.swift': 'Swift', '.rb': 'Ruby', '.php': 'PHP', '.lua': 'Lua', '.pl': 'Perl',
  '.r': 'R', '.sql': 'SQL', '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS', '.html': 'HTML', '.htm': 'HTML',
  '.xml': 'XML', '.svg': 'XML', '.vue': 'Vue', '.svelte': null, '.ini': 'Properties files', '.conf': null,
  '.diff': 'diff', '.patch': 'diff',
  dockerfile: 'Dockerfile', containerfile: 'Dockerfile', makefile: null, gnumakefile: null, justfile: null,
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
