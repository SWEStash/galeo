import { describe, expect, it } from 'vitest';
import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5 MB'],
    [256 * 1024 * 1024, '256 MB'],
    [1.25 * 1024 ** 3, '1.3 GB'],
  ])('shows %i bytes as %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
