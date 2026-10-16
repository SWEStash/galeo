import { describe, expect, it } from 'vitest';
import { chooseView, detectFormat, JSON_TREE_MAX_BYTES, MARKDOWN_RENDER_MAX_BYTES, TEXT_READER_MAX_BYTES } from './registry';

describe('detectFormat', () => {
  it.each([
    ['/d/plan.md', 'markdown'],
    ['/d/README.markdown', 'markdown'],
    ['/d/notes.MD', 'markdown'],
    ['/d/post.mdx', 'mdx'],
    ['/d/POST.MDX', 'mdx'],
    ['/d/notes.txt', 'text'],
    ['/d/app.log', 'log'],
    ['/d/app.log.1', 'log'],
    ['/d/app.LOG', 'log'],
    ['/d/data.json', 'json'],
    ['/d/DATA.JSON', 'json'],
    ['/d/events.jsonl', 'jsonl'],
    ['/d/events.ndjson', 'jsonl'],
    ['/d/config.yaml', 'yaml'],
    ['/d/compose.yml', 'yaml'],
    ['/d/Cargo.toml', 'toml'],
    ['/d/export.csv', 'csv'],
    ['/d/export.tsv', 'tsv'],
    ['/d/main.rs', 'code'],
    ['/d/app.ts', 'code'],
    ['/d/view.tsx', 'code'],
    ['/d/script.py', 'code'],
    ['/d/run.sh', 'code'],
    ['/d/Dockerfile', 'code'],
    ['/d/Makefile', 'code'],
    ['/d/.env', 'plain'],
    ['/d/archive.md.bak', 'plain'],
    ['/d/data.json.bak', 'plain'],
    ['/d/notes', 'plain'],
  ])('detects %s as %s', (path, format) => {
    expect(detectFormat(path)).toBe(format);
  });

  it('uses only the file name, not the directories', () => {
    expect(detectFormat('/logs.md/readme')).toBe('plain');
    expect(detectFormat('C:\\docs\\a.md')).toBe('markdown');
  });
});

describe('chooseView', () => {
  it('renders Markdown by default', () => {
    expect(chooseView('markdown', { size: 1024 })).toEqual({ view: 'rendered', banner: null });
  });

  it('renders MDX by default, and over the render limit opens it as source with the banner', () => {
    expect(chooseView('mdx', { size: MARKDOWN_RENDER_MAX_BYTES })).toEqual({ view: 'rendered', banner: null });
    expect(chooseView('mdx', { size: MARKDOWN_RENDER_MAX_BYTES + 1 })).toEqual({ view: 'source', banner: 'too-large' });
  });

  it('opens .txt in the reader view', () => {
    expect(chooseView('text', { size: 1024 })).toEqual({ view: 'rendered', banner: null });
  });

  it('opens JSON as a tree up to 10 MB, and as source with the too-large banner past it', () => {
    expect(JSON_TREE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(chooseView('json', { size: JSON_TREE_MAX_BYTES })).toEqual({ view: 'rendered', banner: null });
    expect(chooseView('json', { size: JSON_TREE_MAX_BYTES + 1 })).toEqual({ view: 'source', banner: 'too-large' });
  });

  it.each(['log', 'plain', 'jsonl', 'yaml', 'toml', 'csv', 'tsv', 'code'] as const)('opens %s in the source view', (format) => {
    expect(chooseView(format, { size: 1024 })).toEqual({ view: 'source', banner: null });
  });

  it('shows Markdown over the render limit as source with the too-large banner', () => {
    expect(chooseView('markdown', { size: MARKDOWN_RENDER_MAX_BYTES })).toEqual({ view: 'rendered', banner: null });
    expect(chooseView('markdown', { size: MARKDOWN_RENDER_MAX_BYTES + 1 })).toEqual({
      view: 'source',
      banner: 'too-large',
    });
  });

  it('opens plain text over the reader limit as source with the too-large banner', () => {
    expect(chooseView('text', { size: TEXT_READER_MAX_BYTES })).toEqual({ view: 'rendered', banner: null });
    expect(chooseView('text', { size: TEXT_READER_MAX_BYTES + 1 })).toEqual({ view: 'source', banner: 'too-large' });
  });

  it('renders anyway when the user asks, past the limit', () => {
    expect(chooseView('markdown', { size: MARKDOWN_RENDER_MAX_BYTES + 1, renderAnyway: true })).toEqual({
      view: 'rendered',
      banner: null,
    });
  });
});
