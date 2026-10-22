import { describe, expect, it } from 'vitest';
import { findInText } from './find';

const ANY_CASE = { caseSensitive: false };

describe('findInText', () => {
  it('counts a match and returns it with its line and the text around it on that line', () => {
    expect(findInText('first line\nthe needle here\nlast', 'needle', ANY_CASE)).toEqual({
      count: 1,
      capped: false,
      hits: [{ line: 2, before: 'the ', match: 'needle', after: ' here' }],
    });
  });

  it('matches the query literally, not as a pattern', () => {
    expect(findInText('a.b axb (x)', 'a.b', ANY_CASE).count).toBe(1);
    expect(findInText('a.b axb (x)', '(x)', ANY_CASE).count).toBe(1);
  });

  it('ignores case unless asked to match it, and reports the text as written', () => {
    expect(findInText('Galeo galeo GALEO', 'galeo', ANY_CASE).count).toBe(3);
    expect(findInText('Galeo galeo GALEO', 'galeo', { caseSensitive: true }).count).toBe(1);
    expect(findInText('Ünïcode', 'ünï', ANY_CASE).hits[0]!.match).toBe('Ünï');
  });

  it('counts matches that do not overlap, as the find bar does', () => {
    expect(findInText('aaaa', 'aa', ANY_CASE).count).toBe(2);
  });

  it('finds nothing for a query shorter than two characters', () => {
    expect(findInText('a b c', 'a', ANY_CASE)).toEqual({ count: 0, capped: false, hits: [] });
    expect(findInText('a b c', '', ANY_CASE)).toEqual({ count: 0, capped: false, hits: [] });
    expect(findInText('x 😀 y', '😀', ANY_CASE).count).toBe(0);
    expect(findInText('日本語', '日本', ANY_CASE).count).toBe(1);
  });

  it('counts lines across \\n, \\r\\n and lone \\r breaks', () => {
    const lines = findInText('one hit\r\ntwo hit\rthree hit\nfour hit', 'hit', ANY_CASE).hits.map((hit) => hit.line);
    expect(lines).toEqual([1, 2, 3, 4]);
  });

  it('keeps the text around a match to its own line, at most 40 characters each side, whitespace collapsed', () => {
    const far = `${'x'.repeat(60)}\tneedle ${'y'.repeat(60)}`;
    const [hit] = findInText(`above\n${far}\nbelow`, 'needle', ANY_CASE).hits;
    expect(hit).toEqual({ line: 2, before: `${'x'.repeat(39)} `, match: 'needle', after: ` ${'y'.repeat(39)}` });
    expect(findInText('top\nneedle\nend', 'needle', ANY_CASE).hits[0]).toMatchObject({ before: '', after: '' });
    expect(findInText('a \t  needle', 'needle', ANY_CASE).hits[0]!.before).toBe('a ');
  });

  it('never splits a surrogate pair at the edge of the text around a match', () => {
    const [hit] = findInText(`😀${'a'.repeat(39)}needle${'b'.repeat(39)}😀`, 'needle', ANY_CASE).hits;
    expect(hit!.before).toBe('a'.repeat(39));
    expect(hit!.after).toBe('b'.repeat(39));
  });

  it('returns the first 20 hits but counts every match', () => {
    const result = findInText(Array.from({ length: 30 }, (_, i) => `hit ${i}`).join('\n'), 'hit', ANY_CASE);
    expect(result.count).toBe(30);
    expect(result.hits).toHaveLength(20);
    expect(result.hits.at(-1)!.line).toBe(20);
  });

  it('stops counting at 10,000 matches and says so', () => {
    expect(findInText('ab'.repeat(10_001), 'ab', ANY_CASE)).toMatchObject({ count: 10_000, capped: true });
    expect(findInText('ab'.repeat(10_000), 'ab', ANY_CASE)).toMatchObject({ count: 10_000, capped: false });
  });
});
