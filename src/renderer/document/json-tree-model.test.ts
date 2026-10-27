import { describe, expect, it } from 'vitest';
import { indexJson } from '../../shared/json-index';
import { createTreeModel, type TreeModel } from './json-tree-model';

function model(text: string): TreeModel {
  const parsed = indexJson(text);
  if (parsed.state !== 'tree') throw new Error(parsed.state);
  return createTreeModel(text, parsed.tree);
}

/** The visible rows as the tree shows them: indent, label. */
const shown = (tree: TreeModel) => Array.from(tree.rows(), (node) => `${'  '.repeat(tree.depth(node))}${tree.label(node)}`);

const SAMPLE = '{"name": "galeo", "tags": ["a", "b"], "nested": {"deep": {"x": 1}}, "empty": {}}';

describe('JSON tree model', () => {
  it('opens with the top level shown', () => {
    expect(shown(model(SAMPLE))).toEqual(['{4 keys}', '  name: "galeo"', '  tags: [2 items]', '  nested: {1 key}', '  empty: {0 keys}']);
  });

  it("splits each row into its key and its value, with the value's type", () => {
    const tree = model('{"s": "galeo", "n": -1.5e3, "t": true, "f": false, "z": null, "o": {}, "a": [1]}');
    tree.expandAll();
    expect(Array.from(tree.rows(), (node) => tree.parts(node))).toEqual([
      { key: null, value: '{7 keys}', type: 'object' },
      { key: 's', value: '"galeo"', type: 'string' },
      { key: 'n', value: '-1.5e3', type: 'number' },
      { key: 't', value: 'true', type: 'true' },
      { key: 'f', value: 'false', type: 'false' },
      { key: 'z', value: 'null', type: 'null' },
      { key: 'o', value: '{0 keys}', type: 'object' },
      { key: 'a', value: '[1 item]', type: 'array' },
      { key: null, value: '1', type: 'number' },
    ]);
  });

  it('expands and collapses a node, and only nodes with children', () => {
    const tree = model(SAMPLE);
    const tags = tree.rows()[2]!;
    tree.toggle(tags);
    expect(shown(tree).slice(2, 5)).toEqual(['  tags: [2 items]', '    "a"', '    "b"']);
    expect(tree.isExpanded(tags)).toBe(true);
    tree.toggle(tags);
    expect(shown(tree)).toHaveLength(5);
    const empty = tree.rows()[4]!;
    expect(tree.expandable(empty)).toBe(false);
    tree.toggle(empty);
    expect(tree.isExpanded(empty)).toBe(false);
  });

  it('expands everything, and collapses back to the top level', () => {
    const tree = model(SAMPLE);
    tree.expandAll();
    expect(shown(tree)).toEqual([
      '{4 keys}',
      '  name: "galeo"',
      '  tags: [2 items]',
      '    "a"',
      '    "b"',
      '  nested: {1 key}',
      '    deep: {1 key}',
      '      x: 1',
      '  empty: {0 keys}',
    ]);
    tree.collapseAll();
    expect(shown(tree)).toHaveLength(5);
  });

  it("gives each node's position among its siblings and their number, for assistive technology", () => {
    const tree = model(SAMPLE);
    const [root, name, tags] = tree.rows();
    expect([tree.positionInSet(root!), tree.setSize(root!)]).toEqual([1, 1]);
    expect([tree.positionInSet(name!), tree.setSize(name!)]).toEqual([1, 4]);
    expect([tree.positionInSet(tags!), tree.setSize(tags!)]).toEqual([2, 4]);
  });

  it('shows scalars as JSON would write them, long strings cut short', () => {
    const tree = model(`[1e400, true, null, "line\\nbreak", "${'x'.repeat(300)}"]`);
    const labels = shown(tree).slice(1).map((label) => label.trim());
    expect(labels.slice(0, 4)).toEqual(['1e400', 'true', 'null', '"line\\nbreak"']);
    expect(labels[4]).toHaveLength(2 + 200 + 1);
    expect(labels[4]!.endsWith('x…"')).toBe(true);
  });

  it('names the path to a node, quoting keys that are not plain identifiers', () => {
    const text = '{"items": [{"name": 1}], "odd key": {"a\\"b": 2}, "_ok$": 3}';
    const tree = model(text);
    tree.expandAll();
    expect(Array.from(tree.rows(), (node) => tree.path(node))).toEqual([
      '$',
      '$.items',
      '$.items[0]',
      '$.items[0].name',
      '$["odd key"]',
      '$["odd key"]["a\\"b"]',
      '$._ok$',
    ]);
  });

  it('maps a node to its source line and a line to the node there', () => {
    const text = '{\n  "a": [\n    1,\n    2\n  ],\n  "b": 3\n}';
    const tree = model(text);
    tree.expandAll();
    const [root, a, one, two, b] = tree.rows();
    expect([root, a, one, two, b].map((node) => tree.lineOf(node!))).toEqual([1, 2, 3, 4, 6]);
    expect(tree.nodeAtLine(5)).toBe(two);
    expect(tree.nodeAtLine(6)).toBe(b);
    expect(tree.nodeAtLine(99)).toBe(b);
  });

  it('shows a hidden node by expanding the nodes above it', () => {
    const tree = model(SAMPLE);
    const x = tree.nodeAtLine(1);
    expect(x).toBe(0);
    const deepX = tree.find('$.nested.deep.x')!;
    expect(tree.rows()).not.toContain(deepX);
    tree.reveal(deepX);
    expect(tree.rows()).toContain(deepX);
  });

  it('keeps what was expanded, by path, in a new version of the document', () => {
    const tree = model(SAMPLE);
    tree.toggle(tree.find('$.nested')!);
    tree.toggle(tree.find('$.nested.deep')!);
    const next = model('{"added": 0, "nested": {"deep": {"x": 1, "y": 2}}}');
    next.keepExpanded(tree);
    expect(shown(next)).toEqual(['{2 keys}', '  added: 0', '  nested: {1 key}', '    deep: {2 keys}', '      x: 1', '      y: 2']);
  });
});
