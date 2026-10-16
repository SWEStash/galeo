import { CODE_LANGUAGES, type FormatId, type ViewMode } from '../../shared/formats';
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

/** JSON past this opens as source: the tree's starting limit (ADR-018 "Limits"). */
export const JSON_TREE_MAX_BYTES = 10 * 1024 * 1024;

/** CSV/TSV past this opens as source, unless the reader asks for the table (ADR-018, ADR-020). */
export const TABLE_MAX_BYTES = 100 * 1024 * 1024;

const table = (extensions: readonly string[]): FormatSpec => ({ extensions, defaultView: 'rendered', renderMaxBytes: TABLE_MAX_BYTES });

/** Source code: extensions and whole names, from the shared table that also names each language. */
const CODE_FILES = Object.keys(CODE_LANGUAGES);
const CODE_EXTENSIONS = CODE_FILES.filter((key) => key.startsWith('.'));
const CODE_NAMES = new Set(CODE_FILES.filter((key) => !key.startsWith('.')));

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
  json: {
    extensions: ['.json'],
    defaultView: 'rendered',
    renderMaxBytes: JSON_TREE_MAX_BYTES,
  },
  jsonl: sourceOnly(['.jsonl', '.ndjson']),
  yaml: sourceOnly(['.yaml', '.yml']),
  toml: sourceOnly(['.toml']),
  csv: table(['.csv']),
  tsv: table(['.tsv']),
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
