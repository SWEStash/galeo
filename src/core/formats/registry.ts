import type { FormatId, ViewMode } from '../../shared/formats';
import { fileName } from '../../shared/paths';

export interface FormatSpec {
  /** Lower-case, with the dot; matched against the end of the file name. */
  extensions: readonly string[];
  /** Names matched whole (lower-case) or by a rule: rotated logs (`app.log.1`), `Dockerfile`. */
  matchesName?: (name: string) => boolean;
  defaultView: ViewMode;
  /** Above this size the rendered view is not the default (source + banner); null: no limit. */
  renderMaxBytes: number | null;
}

/** Markdown or MDX over 5 MB opens as source (SR-14). */
export const MARKDOWN_RENDER_MAX_BYTES = 5 * 1024 * 1024;

/** The `.txt` reader builds a paragraph per block of text; past this, source is lighter. */
export const TEXT_READER_MAX_BYTES = 5 * 1024 * 1024;

/** Common source code; the page picks the language from the extension (ADR-018). */
const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.sh', '.bash', '.zsh', '.fish',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.java', '.kt', '.kts', '.swift', '.rb', '.php', '.lua', '.pl', '.r',
  '.sql', '.css', '.scss', '.less', '.html', '.htm', '.xml', '.svg', '.vue', '.svelte', '.ini', '.conf', '.diff', '.patch',
] as const;
const CODE_NAMES = new Set(['dockerfile', 'containerfile', 'makefile', 'gnumakefile', 'justfile']);

const sourceOnly = (extensions: readonly string[]): FormatSpec => ({ extensions, defaultView: 'source', renderMaxBytes: null });

/** The core part of the format registry (ADR-018): detection, limits and the default view per format. */
export const FORMATS: Readonly<Record<FormatId, FormatSpec>> = {
  markdown: {
    extensions: ['.md', '.markdown'],
    defaultView: 'rendered',
    renderMaxBytes: MARKDOWN_RENDER_MAX_BYTES,
  },
  mdx: {
    extensions: ['.mdx'],
    defaultView: 'rendered',
    renderMaxBytes: MARKDOWN_RENDER_MAX_BYTES,
  },
  text: {
    extensions: ['.txt'],
    defaultView: 'rendered',
    renderMaxBytes: TEXT_READER_MAX_BYTES,
  },
  log: {
    extensions: ['.log'],
    matchesName: (name) => /\.log\.\d+$/.test(name),
    defaultView: 'source',
    renderMaxBytes: null,
  },
  json: sourceOnly(['.json']),
  jsonl: sourceOnly(['.jsonl', '.ndjson']),
  yaml: sourceOnly(['.yaml', '.yml']),
  toml: sourceOnly(['.toml']),
  csv: sourceOnly(['.csv']),
  tsv: sourceOnly(['.tsv']),
  code: { ...sourceOnly(CODE_EXTENSIONS), matchesName: (name) => CODE_NAMES.has(name) },
  plain: {
    extensions: [],
    defaultView: 'source',
    renderMaxBytes: null,
  },
};

/** The format of a file by its name; anything unrecognised is `plain` text. */
export function detectFormat(path: string): FormatId {
  const name = fileName(path).toLowerCase();
  for (const [id, spec] of Object.entries(FORMATS) as [FormatId, FormatSpec][]) {
    if (spec.extensions.some((extension) => name.endsWith(extension)) || spec.matchesName?.(name)) return id;
  }
  return 'plain';
}

export interface ViewChoice {
  view: ViewMode;
  banner: 'too-large' | null;
}

/** The view a document opens in, given its size; "Render anyway" lifts the render limit. */
export function chooseView(format: FormatId, file: { size: number; renderAnyway?: boolean }): ViewChoice {
  const spec = FORMATS[format];
  const overLimit = spec.renderMaxBytes !== null && file.size > spec.renderMaxBytes && !file.renderAnyway;
  if (spec.defaultView === 'rendered' && overLimit) return { view: 'source', banner: 'too-large' };
  return { view: spec.defaultView, banner: null };
}
