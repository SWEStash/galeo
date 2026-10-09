import { describe, expect, it } from 'vitest';
import { extractReferences, referencesTask } from './references';

describe('extractReferences', () => {
  it('collects inline links in document order, once each', () => {
    expect(extractReferences('[a](one.md) [b](https://x.org/p) [c](#top) [a again](one.md)').links).toEqual([
      'one.md',
      'https://x.org/p',
      '#top',
    ]);
  });

  it('collects reference-style links and autolinks', () => {
    const text = 'See [the plan][p] and <https://auto.example/> or www.example.com.\n\n[p]: plans/v1.md "Plan"';
    expect(extractReferences(text).links).toEqual(['plans/v1.md', 'https://auto.example/', 'http://www.example.com']);
  });

  it('collects anchors and images written as raw HTML', () => {
    const { links, images } = extractReferences('<a href="raw.md">raw</a> <p><img src="pics/a.png"></p>');
    expect(links).toEqual(['raw.md']);
    expect(images).toEqual(['pics/a.png']);
  });

  it('keeps only local images; remote and protocol-relative ones never load', () => {
    const text = '![a](img/a.png) ![b](https://t.example/b.png) ![c](//t.example/c.png) ![a](img/a.png)';
    expect(extractReferences(text).images).toEqual(['img/a.png']);
  });

  it('drops links the sanitizer strips or that point at another host', () => {
    const text = '[x](javascript:alert(1)) [y](file:///etc/passwd) [z](//t.example/z) <a href="vbscript:x">v</a> [ok](ok.md)';
    expect(extractReferences(text).links).toEqual(['ok.md']);
  });

  it('includes footnote links, which point inside the document', () => {
    expect(extractReferences('Text.[^n]\n\n[^n]: Note.').links).toEqual([
      '#user-content-fn-n',
      '#user-content-fnref-n',
    ]);
  });

  it('ignores frontmatter and math', () => {
    expect(extractReferences('---\nurl: https://front.example\n---\n\n$\\href{https://m.example}{x}$').links).toEqual([]);
  });

  it('parses MDX by its format: expressions and component props are never links', () => {
    const text = '{"[x](x.md)"}\n\n<Card href="card.md" src="card.png" />\n\n<a href="html.md">h</a> [md](md.md) <img src="i.png" alt="" />\n';
    expect(extractReferences(text, 'mdx')).toEqual({ links: ['html.md', 'md.md'], images: ['i.png'] });
    expect(extractReferences('{"[x](x.md)"}', 'markdown').links).toEqual(['x.md']);
  });

  it('runs as a task on { text, format } only', () => {
    expect(referencesTask({ text: '[a](a.md)', format: 'mdx' })).toEqual({ links: ['a.md'], images: [] });
    for (const input of ['[a](a.md)', { text: '[a](a.md)' }, { text: 1, format: 'mdx' }, { text: '', format: 'text' }, null]) {
      expect(() => referencesTask(input)).toThrow(/bad input/);
    }
  });
});
