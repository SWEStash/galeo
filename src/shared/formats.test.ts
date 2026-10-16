import { describe, expect, it } from 'vitest';
import { FORMAT_VIEWS, workerFormat, type FormatId } from './formats';

const ids = Object.keys(FORMAT_VIEWS) as FormatId[];
const withViews = (pick: (views: (typeof FORMAT_VIEWS)[FormatId]) => boolean) => ids.filter((id) => pick(FORMAT_VIEWS[id]));

describe('workerFormat', () => {
  it('sends Markdown and MDX to the render worker, each as itself', () => {
    expect(workerFormat('markdown')).toBe('markdown');
    expect(workerFormat('mdx')).toBe('mdx');
  });

  it.each(['text', 'log', 'plain', 'json', 'csv', 'code'] as const)('renders %s without the worker', (format) => {
    expect(workerFormat(format)).toBeNull();
  });
});

describe('FORMAT_VIEWS', () => {
  it('describes every format', () => {
    expect([...ids].sort()).toEqual(['code', 'csv', 'json', 'jsonl', 'log', 'markdown', 'mdx', 'plain', 'text', 'toml', 'tsv', 'yaml']);
  });

  it('renders Markdown and MDX in the worker, and .txt as reader text, JSON as a tree and CSV/TSV as a table on the page', () => {
    expect(withViews((views) => views.rendered === 'worker')).toEqual(['markdown', 'mdx']);
    expect(withViews((views) => views.rendered === 'host')).toEqual(['text', 'json', 'csv', 'tsv']);
    expect(withViews((views) => views.reader)).toEqual(['text']);
  });

  it('offers split on Markdown, MDX, CSV and TSV, an outline on Markdown, MDX, YAML and TOML, and follow-end on logs', () => {
    expect(withViews((views) => views.split)).toEqual(['markdown', 'mdx', 'csv', 'tsv']);
    expect(withViews((views) => views.outline)).toEqual(['markdown', 'mdx', 'yaml', 'toml']);
    expect(withViews((views) => views.follow)).toEqual(['log']);
  });

  it('lets every text format be edited', () => {
    expect(withViews((views) => !views.editable)).toEqual([]);
  });

  it('only splits formats that have a rendered view', () => {
    expect(withViews((views) => views.split && views.rendered === 'none')).toEqual([]);
  });
});
