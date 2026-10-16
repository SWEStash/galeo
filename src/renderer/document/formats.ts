import { CODE_LANGUAGES, type FormatId } from '../../shared/formats';
import { extensionOf, fileName } from '../../shared/paths';
import type { SourceLanguage } from './source-view';

/** The language each format's source is highlighted with; `code` takes it from the file name. */
const FORMAT_LANGUAGES: Readonly<Record<Exclude<FormatId, 'code'>, SourceLanguage>> = {
  markdown: 'markdown',
  mdx: 'markdown',
  text: null,
  log: 'log',
  json: 'JSON',
  jsonl: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  csv: null,
  tsv: null,
  plain: null,
};

/** The page side of the format registry (ADR-018): the language a document's source view highlights with. */
export function sourceLanguage(format: FormatId, path: string): SourceLanguage {
  if (format !== 'code') return FORMAT_LANGUAGES[format];
  // Own keys only: a file named `constructor` is not code.
  const language = (key: string) => (Object.hasOwn(CODE_LANGUAGES, key) ? CODE_LANGUAGES[key] : undefined);
  return language(fileName(path).toLowerCase()) ?? language(extensionOf(path)) ?? null;
}

/** What the status bar calls a format's rendered view where "Rendered" says too little (UX F10, F14). */
export const RENDERED_VIEW_NAMES: Partial<Record<FormatId, string>> = { text: 'Reader', json: 'Tree', csv: 'Table', tsv: 'Table' };

/** How messages name a format ("No split view for JSON files"). */
export const FORMAT_NAMES: Readonly<Record<FormatId, string>> = {
  markdown: 'Markdown',
  mdx: 'MDX',
  text: 'text',
  log: 'log',
  json: 'JSON',
  jsonl: 'JSON Lines',
  yaml: 'YAML',
  toml: 'TOML',
  csv: 'CSV',
  tsv: 'TSV',
  code: 'source code',
  plain: 'plain text',
};
