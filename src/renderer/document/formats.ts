import type { FormatId } from '../../shared/formats';
import type { SourceLanguage } from './source-view';

/** The page side of the format registry (ADR-018): the language the source view highlights with. */
export const SOURCE_LANGUAGES: Readonly<Record<FormatId, SourceLanguage>> = {
  markdown: 'markdown',
  mdx: 'markdown',
  text: null,
  log: 'log',
  json: null,
  jsonl: null,
  yaml: null,
  toml: null,
  csv: null,
  tsv: null,
  code: null,
  plain: null,
};

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
