import { describe, expect, it } from 'vitest';
import { hasScheme, isLocalReference } from './urls';

describe('hasScheme', () => {
  it.each(['https://example.com', 'mailto:a@b.c', 'javascript:alert(1)', 'file:///C:/x.md', ' java\tscript:x'])('reads %s as naming a scheme', (url) => {
    expect(hasScheme(url)).toBe(true);
  });

  it.each(['C:\\Docs\\notes.md', 'c:/docs/notes.md', 'D:/x.png', '\u0001C:/x.md'])('reads the Windows drive path %s as a path', (url) => {
    expect(hasScheme(url)).toBe(false);
    expect(isLocalReference(url)).toBe(true);
  });

  it('keeps a drive letter without a slash (relative to that drive’s current folder) a scheme, so it is refused', () => {
    expect(hasScheme('C:notes.md')).toBe(true);
  });
});
