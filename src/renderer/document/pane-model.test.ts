import { describe, expect, it } from 'vitest';
import type { FormatId } from '../../shared/formats';
import { countLines, formatView, notSaved } from './pane-model';

describe('formatView', () => {
  it('draws JSON as a tree and CSV/TSV as a table, .txt as reader text, the rest as their format says', () => {
    expect(formatView('json', false)).toMatchObject({ tree: true, table: false, renderable: true, splittable: false });
    expect(formatView('csv', false)).toMatchObject({ tree: false, table: true, renderable: true, splittable: true });
    expect(formatView('tsv', false)).toMatchObject({ table: true, separator: '\t' });
    expect(formatView('text', false)).toMatchObject({ reader: true, table: false, renderable: true });
    expect(formatView('markdown', false)).toMatchObject({ tree: false, table: false, renderable: true, splittable: true });
    expect(formatView('yaml', false)).toMatchObject({ renderable: false, splittable: false });
  });

  it('shows a text file as a table when asked, with a split, but leaves formats with a view of their own alone', () => {
    for (const format of ['plain', 'text', 'log', 'code'] as const) {
      expect(formatView(format, true)).toMatchObject({ asTable: true, table: true, renderable: true, splittable: true });
    }
    for (const format of ['markdown', 'mdx', 'json', 'csv', 'tsv'] as const satisfies readonly FormatId[]) {
      expect(formatView(format, true).asTable).toBe(false);
    }
  });

  it('sniffs the separator unless the format says it', () => {
    expect(formatView('csv', false).separator).toBe('sniff');
    expect(formatView('plain', true).separator).toBe('sniff');
  });
});

describe('notSaved', () => {
  it('says why a save did not write', () => {
    expect(notSaved({ kind: 'conflict', version: null }, 'utf-8')).toBe('Not saved: the file is gone');
    expect(notSaved({ kind: 'conflict', version: 'v2' }, 'utf-8')).toBe('Not saved: the file changed on disk');
    expect(notSaved({ kind: 'failed', reason: 'no-permission' }, 'utf-8')).toBe('Not saved: no permission to write this file');
    expect(notSaved({ kind: 'refused', reason: 'not-editable' }, 'utf-8')).toBe("Not saved: this tab isn't in edit mode");
  });

  it('names the encoding and the character it cannot hold', () => {
    expect(notSaved({ kind: 'unencodable', character: '€', line: 3 }, 'windows-1252')).toBe("Not saved: Windows-1252 can't hold “€” (line 3)");
  });
});

describe('countLines', () => {
  it('counts the lines a source view shows, the last one even if empty', () => {
    expect(countLines('')).toBe(1);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb\n')).toBe(3);
  });
});
