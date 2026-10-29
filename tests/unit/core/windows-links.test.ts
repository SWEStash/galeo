import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyLink, type LinkContext } from '../../../src/core/links/classify';

/** Links in a document on a Windows disk, resolved by Windows path rules as main does there. */
const windows: LinkContext = {
  documentPath: 'C:\\Users\\me\\notes\\plan.md',
  dirname: path.win32.dirname,
  resolve: path.win32.resolve,
  parseUrl: (href) => {
    try {
      const url = new URL(href);
      return { protocol: url.protocol, href: url.href };
    } catch {
      return null;
    }
  },
};

describe('classifyLink under Windows path rules', () => {
  it('opens a link to a drive path as that file', () => {
    expect(classifyLink('D:/Docs/b.md#intro', windows)).toEqual({ kind: 'file', path: 'D:\\Docs\\b.md', anchor: 'intro' });
    expect(classifyLink('C:\\Users\\me\\a.md', windows)).toEqual({ kind: 'file', path: 'C:\\Users\\me\\a.md', anchor: null });
  });

  it('opens a link to a program as a file shown inside galeo, which never runs it (SR-05)', () => {
    expect(classifyLink('C:\\Windows\\system32\\calc.exe', windows)).toEqual({ kind: 'file', path: 'C:\\Windows\\system32\\calc.exe', anchor: null });
  });

  it('resolves a relative link against the document’s folder', () => {
    expect(classifyLink('../a.md', windows)).toEqual({ kind: 'file', path: 'C:\\Users\\me\\a.md', anchor: null });
  });

  it('still refuses UNC and device paths, however they are spelled', () => {
    for (const href of ['\\\\host\\share\\a.md', '//host/share/a.md', '%5C%5Chost%5Cshare%5Ca.md', '\\\\?\\C:\\a.md']) {
      expect(classifyLink(href, windows)).toEqual({ kind: 'refused', reason: 'host' });
    }
  });

  it('still refuses file: URLs and a drive letter without a slash', () => {
    expect(classifyLink('file:///C:/a.md', windows)).toEqual({ kind: 'refused', reason: 'scheme' });
    expect(classifyLink('C:a.md', windows)).toEqual({ kind: 'refused', reason: 'scheme' });
  });
});

describe('classifyLink under Linux path rules', () => {
  it('reads a Windows drive path as a name in the document’s folder, nothing more', () => {
    const linux: LinkContext = { ...windows, documentPath: '/home/me/plan.md', dirname: path.posix.dirname, resolve: path.posix.resolve };
    expect(classifyLink('C:/Docs/b.md', linux)).toEqual({ kind: 'file', path: '/home/me/C:/Docs/b.md', anchor: null });
  });
});
