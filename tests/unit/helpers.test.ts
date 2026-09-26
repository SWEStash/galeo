import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeTempTree } from '../helpers';

describe('writeTempTree', () => {
  it('writes nested files under a temp root', () => {
    const root = writeTempTree({ 'a/b.txt': 'hello' });
    expect(readFileSync(path.join(root, 'a/b.txt'), 'utf8')).toBe('hello');
  });
});
