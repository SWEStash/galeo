import { describe, expect, it } from 'vitest';
import { FsError, isMissing } from './file-system';

describe('isMissing', () => {
  it('is true only for a file system error saying the path is missing', () => {
    expect(isMissing(new FsError('ENOENT', '/a'))).toBe(true);
    expect(isMissing(new FsError('EACCES', '/a'))).toBe(false);
    expect(isMissing(Object.assign(new Error('gone'), { code: 'ENOENT' }))).toBe(false);
  });
});
