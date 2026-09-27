import { describe, expect, it } from 'vitest';
import { classifyLink, type LinkContext } from './classify';

// Core's typecheck has no platform globals; the test runs on Node, which has URL.
declare const URL: new (href: string) => { protocol: string; href: string };

// Main injects Node's path functions and the WHATWG URL parser; these behave the same for tests.
const context: LinkContext = {
  documentPath: '/home/u/plans/v1/plan.md',
  dirname: (path) => path.slice(0, path.lastIndexOf('/')) || '/',
  resolve: (dir, rel) => {
    const parts = (rel.startsWith('/') ? rel : `${dir}/${rel}`).split('/');
    const out: string[] = [];
    for (const part of parts) {
      if (part === '..') out.pop();
      else if (part && part !== '.') out.push(part);
    }
    return `/${out.join('/')}`;
  },
  parseUrl: (href) => {
    try {
      const url = new URL(href);
      return { protocol: url.protocol, href: url.href };
    } catch {
      return null;
    }
  },
};

const classify = (href: string) => classifyLink(href, context);

describe('classifyLink', () => {
  it('reads #fragments as anchors in the same document, decoded', () => {
    expect(classify('#goals')).toEqual({ kind: 'anchor', anchor: 'goals' });
    expect(classify('#caf%C3%A9')).toEqual({ kind: 'anchor', anchor: 'café' });
    expect(classify('#')).toEqual({ kind: 'anchor', anchor: '' });
  });

  it('resolves relative and absolute paths against the document, keeping the anchor', () => {
    expect(classify('other.md')).toEqual({ kind: 'file', path: '/home/u/plans/v1/other.md', anchor: null });
    expect(classify('../v2/next.md#scope')).toEqual({ kind: 'file', path: '/home/u/plans/v2/next.md', anchor: 'scope' });
    expect(classify('./a%20b.md')).toEqual({ kind: 'file', path: '/home/u/plans/v1/a b.md', anchor: null });
    expect(classify('/etc/notes.md')).toEqual({ kind: 'file', path: '/etc/notes.md', anchor: null });
    expect(classify('data.md?raw=1#x')).toEqual({ kind: 'file', path: '/home/u/plans/v1/data.md', anchor: 'x' });
  });

  it('opens only http, https and mailto externally, normalized', () => {
    expect(classify('https://example.org/a b')).toEqual({ kind: 'external', url: 'https://example.org/a%20b' });
    expect(classify('HTTP://Example.ORG')).toEqual({ kind: 'external', url: 'http://example.org/' });
    expect(classify('mailto:me@example.org')).toEqual({ kind: 'external', url: 'mailto:me@example.org' });
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0001javascript:alert(1)',
    'file:///etc/passwd',
    'FILE:///etc/passwd',
    'data:text/html,x',
    'vbscript:x',
    'galeo://app/index.html',
    'vscode://file/etc/passwd',
    'C:\\Windows\\system32\\calc.exe',
    'ftp://example.org/x',
  ])('refuses the scheme of %j', (href) => {
    expect(classify(href)).toEqual({ kind: 'refused', reason: 'scheme' });
  });

  it('refuses links to another host by protocol-relative or backslash paths', () => {
    expect(classify('//evil.example/x')).toEqual({ kind: 'refused', reason: 'host' });
    expect(classify('\\\\evil.example\\x')).toEqual({ kind: 'refused', reason: 'host' });
    expect(classify('/\\evil.example/x')).toEqual({ kind: 'refused', reason: 'host' });
  });

  it('keeps an encoded scheme a local path, never an external URL', () => {
    expect(classify('javascript%3Aalert(1)')).toEqual({
      kind: 'file',
      path: '/home/u/plans/v1/javascript:alert(1)',
      anchor: null,
    });
  });

  it('refuses malformed encodings and unparseable URLs', () => {
    expect(classify('bad%E0%A4%A.md')).toEqual({ kind: 'refused', reason: 'malformed' });
    expect(classify('#bad%E0%A4%A')).toEqual({ kind: 'refused', reason: 'malformed' });
    expect(classify('https://')).toEqual({ kind: 'refused', reason: 'malformed' });
  });

  it('treats a path of only a query as the document itself', () => {
    expect(classify('?x=1')).toEqual({ kind: 'anchor', anchor: '' });
  });
});
