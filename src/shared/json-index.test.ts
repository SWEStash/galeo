import { describe, expect, it } from 'vitest';
import { indexJson, keyOf, scalarText, typeOf, type JsonLimits, type JsonTree } from './json-index';

function treeOf(text: string, limits?: JsonLimits): JsonTree {
  const parsed = indexJson(text, limits);
  if (parsed.state !== 'tree') throw new Error(`expected a tree, got ${parsed.state}`);
  return parsed.tree;
}

/** Each node as one line: depth, key, type, children, and a scalar's text. */
function outline(text: string): string[] {
  const tree = treeOf(text);
  return Array.from({ length: tree.nodes }, (_, node) => {
    let depth = 0;
    for (let up = tree.parents[node]!; up !== -1; up = tree.parents[up]!) depth++;
    const key = keyOf(text, tree, node);
    const type = typeOf(tree, node);
    const what = type === 'object' || type === 'array' ? `${type}(${tree.counts[node]})` : `${type} ${scalarText(text, tree, node)}`;
    return `${'  '.repeat(depth)}${key === null ? '' : `${key}: `}${what}`;
  });
}

describe('JSON index', () => {
  it('indexes a scalar document as one node', () => {
    expect(outline(' 42 ')).toEqual(['number 42']);
  });

  it('indexes objects and arrays in document order, with keys, parents and child counts', () => {
    expect(outline('{"a": [1, true, false], "b": null, "c": {}}')).toEqual([
      'object(3)',
      '  a: array(3)',
      '    number 1',
      '    true true',
      '    false false',
      '  b: null null',
      '  c: object(0)',
    ]);
  });

  it("knows where each node's subtree ends, so the next sibling is one step away", () => {
    const tree = treeOf('[[1, 2], 3]');
    expect(Array.from(tree.ends)).toEqual([5, 4, 3, 4, 5]);
  });

  it('decodes strings and keys, and keeps numbers exactly as written', () => {
    const text = String.raw`{"aé\"": "x\ny", "n": 1e400, "big": 12345678901234567890, "neg": -0.5E-3}`;
    expect(outline(text)).toEqual(['object(4)', '  aé": string x\ny', '  n: number 1e400', '  big: number 12345678901234567890', '  neg: number -0.5E-3']);
  });

  it('keeps keys like __proto__ and constructor as data, and every duplicate key as written', () => {
    const text = '{"__proto__": {"polluted": 1}, "constructor": 2, "a": 1, "a": 2}';
    expect(outline(text)).toEqual(['object(4)', '  __proto__: object(1)', '    polluted: number 1', '  constructor: number 2', '  a: number 1', '  a: number 2']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it("keeps each node's place in the source, at its key when it has one", () => {
    const text = '{\r\n  "a": [\n    7\n  ]\n}';
    const tree = treeOf(text);
    expect(Array.from(tree.places).map((offset) => text.slice(offset, offset + 3))).toEqual(['{\r\n', '"a"', '7\n ']);
  });

  it.each([
    ['{"a":1,}', 1, 8],
    ['[1,\n 2,,3]', 2, 4],
    ['{"a": tru}', 1, 10],
    ['', 1, 1],
    ['{"a":1} x', 1, 9],
    ['"abc', 1, 5],
    ['{\r\n"a" 1}', 2, 5],
    ['[01]', 1, 3],
    ['["tab\there"]', 1, 6],
    ['["\\x"]', 1, 4],
    ['[1,]', 1, 4],
    ['[1 2]', 1, 4],
    ['{1: 2}', 1, 2],
    ['{"a" 1}', 1, 6],
    ['-', 1, 2],
    ['[1.]', 1, 4],
    ['1e+', 1, 4],
    ['"\\u12x"', 1, 6],
    ['nul', 1, 4],
    ['[1] ]', 1, 5],
  ])('points at the first error in %j: line %i, column %i', (text, line, column) => {
    expect(indexJson(text)).toMatchObject({ state: 'invalid', line, column });
  });

  it('is too large past the node cap', () => {
    expect(indexJson('[1, 2, 3]', { nodes: 3, depth: 10 })).toEqual({ state: 'too-large' });
    expect(indexJson('[1, 2]', { nodes: 3, depth: 10 })).toMatchObject({ state: 'tree' });
    expect(indexJson(`[${'0,'.repeat(200_000)}0]`)).toEqual({ state: 'too-large' });
  });

  it('is too large nested deeper than the depth cap', () => {
    expect(indexJson('[[[1]]]', { nodes: 10, depth: 2 })).toEqual({ state: 'too-large' });
    expect(indexJson(`${'['.repeat(1_000)}${']'.repeat(1_000)}`)).toMatchObject({ state: 'tree' });
    expect(indexJson(`${'['.repeat(1_001)}${']'.repeat(1_001)}`)).toEqual({ state: 'too-large' });
  });

  it('reports invalid text as invalid, even when it would also be too large', () => {
    expect(indexJson('[1, 2, 3, x]', { nodes: 2, depth: 10 })).toMatchObject({ state: 'invalid', line: 1, column: 11 });
  });

  it('reads a big document', () => {
    const text = JSON.stringify(Array.from({ length: 30_000 }, (_, i) => ({ id: i, name: `n${i}`, tags: ['x', 'y'] })));
    expect(treeOf(text).nodes).toBe(1 + 30_000 * 6);
  });

  describe('against JSON.parse, over random documents', () => {
    /** A small seeded generator (mulberry32), so a failure can be replayed from its seed. */
    function random(seed: number) {
      return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const STRINGS = ['', 'a', 'é', '"q"', 'back\\slash', 'tab\tnew\nline', '\u0001', '😀', '__proto__'];
    const NUMBERS = [0, -1, 1.5, 1e21, -2.5e-7, 123456789];

    function value(next: () => number, depth: number): unknown {
      const pick = next();
      if (depth < 4 && pick < 0.2) return Array.from({ length: Math.floor(next() * 4) }, () => value(next, depth + 1));
      if (depth < 4 && pick < 0.4)
        return Object.fromEntries(Array.from({ length: Math.floor(next() * 4) }, (_, i) => [`k${i}${STRINGS[Math.floor(next() * STRINGS.length)]}`, value(next, depth + 1)]));
      if (pick < 0.6) return STRINGS[Math.floor(next() * STRINGS.length)];
      if (pick < 0.8) return NUMBERS[Math.floor(next() * NUMBERS.length)];
      return [true, false, null][Math.floor(next() * 3)];
    }

    /** The value the index describes, rebuilt from it alone. */
    function rebuild(text: string, tree: JsonTree, node = 0): unknown {
      const type = typeOf(tree, node);
      if (type === 'array' || type === 'object') {
        const children: number[] = [];
        for (let child = node + 1; child < tree.ends[node]!; child = tree.ends[child]!) children.push(child);
        if (type === 'array') return children.map((child) => rebuild(text, tree, child));
        return Object.fromEntries(children.map((child) => [keyOf(text, tree, child), rebuild(text, tree, child)]));
      }
      if (type === 'string') return scalarText(text, tree, node);
      if (type === 'number') return Number(scalarText(text, tree, node));
      return JSON.parse(scalarText(text, tree, node));
    }

    it('rebuilds what JSON.parse reads, whatever the layout', () => {
      for (let seed = 1; seed <= 300; seed++) {
        const next = random(seed);
        const text = JSON.stringify(value(next, 0), null, [0, 2, '\t', '\r\n '][Math.floor(next() * 4)] as never);
        expect({ seed, value: rebuild(text, treeOf(text)) }).toEqual({ seed, value: JSON.parse(text) });
      }
    });

    it('accepts everything JSON.parse accepts, and finds errors where V8 does when it names a position', () => {
      for (let seed = 1; seed <= 300; seed++) {
        const next = random(seed);
        const valid = JSON.stringify(value(next, 0), null, next() < 0.5 ? 1 : undefined);
        const cut = Math.floor(next() * valid.length);
        const text = valid.slice(0, cut) + valid.slice(cut + 1);
        let v8: string | null = null;
        try {
          JSON.parse(text);
        } catch (error) {
          v8 = (error as Error).message;
        }
        const parsed = indexJson(text);
        expect({ seed, text, state: parsed.state }).toEqual({ seed, text, state: v8 === null ? 'tree' : 'invalid' });
        const at = v8 && /at position (\d+)/.exec(v8);
        if (at && parsed.state === 'invalid') {
          const prefix = text.slice(0, Number(at[1]));
          expect({ seed, text, line: parsed.line }).toEqual({ seed, text, line: prefix.split(/\r\n|\r|\n/).length });
          expect({ seed, text, column: parsed.column }).toEqual({ seed, text, column: prefix.length - Math.max(prefix.lastIndexOf('\n'), prefix.lastIndexOf('\r')) });
        }
      }
    });
  });
});
