import { describe, expect, it } from 'vitest';
import { FORMAT_VIEWS, type FormatId } from '../../shared/formats';
import { FORMAT_NAMES, SOURCE_LANGUAGES } from './formats';

const ids = Object.keys(FORMAT_VIEWS) as FormatId[];

describe('the page side of the format registry', () => {
  it('names every format for messages', () => {
    expect(ids.filter((id) => !FORMAT_NAMES[id])).toEqual([]);
    expect(FORMAT_NAMES.json).toBe('JSON');
  });

  it('highlights Markdown, MDX and logs, and shows the other formats as plain source for now', () => {
    expect(ids.filter((id) => SOURCE_LANGUAGES[id] !== null)).toEqual(['markdown', 'mdx', 'log']);
    expect(SOURCE_LANGUAGES.mdx).toBe('markdown');
  });
});
