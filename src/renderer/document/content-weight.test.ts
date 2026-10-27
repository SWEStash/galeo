import { describe, expect, it } from 'vitest';
import { contentWeight } from './content-weight';

describe('contentWeight', () => {
  it('weighs text as UTF-16, the source only while it exists', () => {
    expect(contentWeight({ html: 'abc' }, null)).toBe(6);
    expect(contentWeight({ text: 'abcd' }, 'xy')).toBe(8 + 4);
    expect(contentWeight(null, 'xyz')).toBe(6);
    expect(contentWeight(null, null)).toBe(0);
  });

  it('weighs a tree by its nodes and a table by its text and offsets', () => {
    expect(contentWeight({ tree: { nodes: 10 } as never, label: 'x' }, null)).toBe(480);
    const table = { fieldEnds: new Array(6), rows: 2 } as never;
    expect(contentWeight({ table, source: 'a,b', label: 'x', header: true }, null)).toBe(2 * 3 + 4 * (6 + 3 * 2));
  });
});
