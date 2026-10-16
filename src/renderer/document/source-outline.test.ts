import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { sourceOutline } from './source-outline';
import { loadGrammar } from './source-view';

async function outline(language: string, text: string) {
  const state = EditorState.create({ doc: text, extensions: (await loadGrammar(language)) ?? [] });
  return sourceOutline(state).map(({ depth, text: name, line, id }) => [depth, name, line, id]);
}

describe('sourceOutline', () => {
  it("lists a YAML file's top-level keys with their lines, not the keys nested in maps, sequences or block text", async () => {
    const text = ['# settings', 'name: galeo', 'items:', '  - a', '  - nested: 1', 'map:', '  inner: 2', '"quoted key": x', 'block: |', '  not: a key', ''].join('\n');
    expect(await outline('YAML', text)).toEqual([
      [1, 'name', 2, 'line:2'],
      [1, 'items', 3, 'line:3'],
      [1, 'map', 6, 'line:6'],
      [1, '"quoted key"', 8, 'line:8'],
      [1, 'block', 9, 'line:9'],
    ]);
  });

  it('groups the keys of a YAML stream by document when it has more than one', async () => {
    const text = ['kind: A', '---', 'kind: B', 'spec: {}', ''].join('\n');
    expect(await outline('YAML', text)).toEqual([
      [1, 'Document 1', 1, 'line:1'],
      [2, 'kind', 1, 'line:1'],
      [1, 'Document 2', 2, 'line:2'],
      [2, 'kind', 3, 'line:3'],
      [2, 'spec', 4, 'line:4'],
    ]);
  });

  it("lists a TOML file's root keys and its tables, not the keys inside tables, arrays or values", async () => {
    const text = [
      'title = "x"',
      'created = 2026-10-16T00:00:00Z',
      'ports = [',
      '  8000,',
      '  true,',
      ']',
      '[package]',
      'name = "galeo"',
      '[[bin]]',
      'path = "a"',
      '[[bin]]',
      '  [package.metadata]',
      '',
    ].join('\n');
    expect(await outline('TOML', text)).toEqual([
      [1, 'title', 1, 'line:1'],
      [1, 'created', 2, 'line:2'],
      [1, 'ports', 3, 'line:3'],
      [1, '[package]', 7, 'line:7'],
      [1, '[[bin]]', 9, 'line:9'],
      [1, '[[bin]]', 11, 'line:11'],
      [1, '[package.metadata]', 12, 'line:12'],
    ]);
  });

  it('has nothing for other languages', async () => {
    expect(await outline('JSON', '{"a": {"b": 1}}')).toEqual([]);
    expect(sourceOutline(EditorState.create({ doc: 'a: 1' }))).toEqual([]);
  });
});
