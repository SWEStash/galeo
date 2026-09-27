import type { FormatId, ViewMode } from '../../shared/formats';

export interface FormatSpec {
  /** Lower-case, with the dot; matched against the end of the file name. */
  extensions: readonly string[];
  /** Rotated logs (`app.log.1`) keep their format. */
  matchesName?: (name: string) => boolean;
  defaultView: ViewMode;
  /** Above this size the rendered view is not the default (source + banner); null: no limit. */
  renderMaxBytes: number | null;
  capabilities: { follow: boolean; outline: boolean };
}

/** Markdown over 5 MB opens as source (SR-14). */
export const MARKDOWN_RENDER_MAX_BYTES = 5 * 1024 * 1024;

/** The `.txt` reader builds a paragraph per block of text; past this, source is lighter. */
export const TEXT_READER_MAX_BYTES = 5 * 1024 * 1024;

/** The core half of the format registry: detection, limits and the default view per format. */
export const FORMATS: Readonly<Record<FormatId, FormatSpec>> = {
  markdown: {
    extensions: ['.md', '.markdown'],
    defaultView: 'rendered',
    renderMaxBytes: MARKDOWN_RENDER_MAX_BYTES,
    capabilities: { follow: false, outline: true },
  },
  text: {
    extensions: ['.txt'],
    defaultView: 'rendered',
    renderMaxBytes: TEXT_READER_MAX_BYTES,
    capabilities: { follow: false, outline: false },
  },
  log: {
    extensions: ['.log'],
    matchesName: (name) => /\.log\.\d+$/.test(name),
    defaultView: 'source',
    renderMaxBytes: null,
    capabilities: { follow: true, outline: false },
  },
  plain: {
    extensions: [],
    defaultView: 'source',
    renderMaxBytes: null,
    capabilities: { follow: false, outline: false },
  },
};

/** The format of a file by its name; anything unrecognised is `plain` text. */
export function detectFormat(path: string): FormatId {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1).toLowerCase();
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
