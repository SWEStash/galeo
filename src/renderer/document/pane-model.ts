import type { Separator } from '../../shared/csv';
import { READ_MAX_BYTES, type SaveResult, type TextEncoding } from '../../shared/documents';
import { FORMAT_VIEWS, type FormatId } from '../../shared/formats';
import type { DiskChange } from './DocumentState';
import { ENCODING_NAMES } from './encodings';
import { formatBytes } from './format-bytes';
import { RENDERED_HOSTS, TABLE_SEPARATORS } from './formats';

interface FormatView {
  views: (typeof FORMAT_VIEWS)[FormatId];
  reader: boolean;
  tree: boolean;
  table: boolean;
  /** Shown as a table because the reader asked. */
  asTable: boolean;
  renderable: boolean;
  splittable: boolean;
  /** The table's separator when the reader chose none: the format's, else sniffed. */
  separator: Separator | 'sniff';
}

/**
 * What a format's tab can show (ADR-018): Markdown and MDX render in the worker, `.txt` as reader
 * text, JSON as a tree, CSV/TSV as a table; the rest is source only. A text file the reader asked to
 * see as a table shows one, unless its format has a rendered view of its own (ADR-021).
 */
export function formatView(format: FormatId, asTableAsked: boolean): FormatView {
  const views = FORMAT_VIEWS[format];
  const host = RENDERED_HOSTS[format];
  const asTable = asTableAsked && views.rendered !== 'worker' && host === undefined;
  return {
    views,
    reader: views.reader,
    tree: host === 'tree',
    table: host === 'table' || asTable,
    asTable,
    renderable: views.rendered !== 'none' || asTable,
    splittable: views.split || asTable,
    separator: TABLE_SEPARATORS[format] ?? 'sniff',
  };
}

/** Why Ctrl+S doesn't write while the bar waits for the reader's choice. */
export const DISK_UNSAVED: Record<DiskChange, string> = {
  'disk-changed': 'Not saved: the file changed on disk. Keep mine or load theirs first',
  'disk-deleted': 'Not saved: the file was deleted. Keep mine or save it again first',
  'disk-unreadable': "Not saved: the file on disk can't be shown as text",
};

/** What the status bar says when a save didn't write. */
export function notSaved(result: Exclude<SaveResult, { kind: 'saved' }>, encoding: TextEncoding): string {
  switch (result.kind) {
    case 'conflict':
      return result.version === null ? 'Not saved: the file is gone' : 'Not saved: the file changed on disk';
    case 'unencodable':
      return `Not saved: ${ENCODING_NAMES[encoding]} can't hold “${result.character}” (line ${result.line})`;
    case 'failed':
      return { 'no-permission': 'Not saved: no permission to write this file', 'not-a-file': "Not saved: this isn't a regular file", unavailable: "Not saved: the file couldn't be written", 'too-large': `Not saved: the file would be over ${formatBytes(READ_MAX_BYTES)}` }[result.reason];
    case 'refused':
      return result.reason === 'not-editable' ? "Not saved: this tab isn't in edit mode" : 'Not saved: press Ctrl+S to save';
  }
}

/** The lines a source view shows, the last one even if empty. */
export function countLines(text: string): number {
  let lines = 1;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) lines++;
  return lines;
}
