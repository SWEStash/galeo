import { describe, expect, it } from 'vitest';
import { chainedSha256, samePrefix, sha256 } from '../../../src/main/adapters/content-hash';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('chainedSha256', () => {
  it('gives the version of the whole file when continued with its new bytes, leaving the earlier state as it was', () => {
    const start = chainedSha256(bytes('line 1\n'));
    const grown = start.update(bytes('line 2\n'));
    expect(start.digest()).toBe(sha256(bytes('line 1\n')));
    expect(grown.digest()).toBe(sha256(bytes('line 1\nline 2\n')));
    expect(grown.update(bytes('line 3\n')).digest()).toBe(sha256(bytes('line 1\nline 2\nline 3\n')));
    expect(start.digest()).toBe(sha256(bytes('line 1\n')));
  });
});

describe('samePrefix', () => {
  it('says whether the bytes start with the prefix, exactly', () => {
    expect(samePrefix(bytes('line 1\n'), bytes('line 1\nline 2\n'))).toBe(true);
    expect(samePrefix(bytes('line 1\n'), bytes('line 1\n'))).toBe(true);
    expect(samePrefix(bytes('line 1\n'), bytes('line X\nline 2\n'))).toBe(false);
    expect(samePrefix(bytes('line 1\n'), bytes('line'))).toBe(false);
    expect(samePrefix(new Uint8Array(0), bytes('a'))).toBe(true);
  });

  it('compares from the start of a view into a larger buffer', () => {
    const buffer = bytes('xxline 1\nline 2\n');
    expect(samePrefix(bytes('line 1\n'), buffer.subarray(2))).toBe(true);
  });
});
