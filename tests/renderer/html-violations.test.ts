import { describe, expect, it } from 'vitest';
import { findViolations } from '../helpers/html-violations';

function violationsIn(html: string): string[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  return findViolations(template.content);
}

// The corpus test is only as good as this checker, so prove it flags each category.
describe('findViolations', () => {
  it('passes safe rendered output', () => {
    expect(
      violationsIn(
        '<h1 id="user-content-a" data-src-line="1">A</h1><p><a href="https://x.org">x</a> <a href="rel.md">r</a> ' +
          '<a href="mailto:a@b.c">m</a> <img data-galeo-src="a.png" alt=""></p><input type="checkbox" disabled>' +
          '<span class="katex" style="height:1em"><math></math></span><pre class="shiki" style="--shiki-light:#fff" tabindex="0"></pre>',
      ),
    ).toEqual([]);
  });

  it.each([
    ['<script>1</script>', '<script>'],
    ['<style>p{}</style>', '<style>'],
    ['<iframe></iframe>', '<iframe>'],
    ['<link rel="preconnect" href="https://x.org">', '<link>'],
    ['<meta http-equiv="refresh">', '<meta>'],
    ['<base href="https://x.org/">', '<base>'],
    ['<svg></svg>', '<svg>'],
    ['<math></math>', '<math> outside KaTeX'],
    ['<input type="text">', '<input> other than a disabled checkbox'],
    ['<img src="a.png">', '<img src> (images load only through main)'],
    ['<p onclick="x()">', 'onclick handler'],
    ['<p style="color:red">', 'style on <p>'],
    ['<a accesskey="t">', 'accesskey'],
    ['<div tabindex="1">', 'tabindex'],
    ['<span class="katex" style="background:url(https://x.org)"></span>', 'style value background:url(https://x.org)'],
    ['<p id="x">', 'id="x"'],
    ['<p data-src-line="1 onclick=x">', 'data-src-line="1 onclick=x"'],
    ['<p data-src-end="0">', 'data-src-end="0"'],
    ['<a href="java\tscript:alert(1)">', 'href: scheme javascript'],
    ['<a href=" JaVaScRiPt:x">', 'href: scheme JaVaScRiPt'],
    ['<a href="data:text/html,x">', 'href: scheme data'],
    ['<a href="file:///etc/passwd">', 'href: scheme file'],
    ['<a href="xmpp:a@b.c">', 'href: scheme xmpp'],
    ['<a href="//evil.example/x">', 'href: protocol-relative URL'],
    ['<a href="\\/evil.example/x">', 'href: protocol-relative URL'],
    ['<a href="\\\\evil.example/x">', 'href: protocol-relative URL'],
  ])('flags %s', (html, violation) => {
    expect(violationsIn(html)).toContain(violation);
  });
});
