import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../src/renderer/worker/pipeline/render';
import { findViolations } from '../helpers/html-violations';

const DIR = path.resolve(import.meta.dirname, '../fixtures/payloads');

// `.payloads.mdx` cases render as MDX, the rest as Markdown.
const cases = readdirSync(DIR)
  .filter((file) => /\.payloads\.mdx?$/.test(file))
  .flatMap((file) =>
    readFileSync(path.join(DIR, file), 'utf8')
      .split(/^%%%$/m)
      .map((text, index) => ({ name: `${file} #${index + 1}`, text: text.trim(), format: file.endsWith('.mdx') ? ('mdx' as const) : ('markdown' as const) })),
  );

const render = createRenderer({ cacheEntries: 0 });

async function renderToFragment(text: string, format: 'markdown' | 'mdx' = 'markdown'): Promise<DocumentFragment> {
  const template = document.createElement('template');
  template.innerHTML = (await render.markdown(text, { format })).html;
  return template.content;
}

describe('sanitizer payload corpus', () => {
  it('has several cases from every payload file', () => {
    const perFile = Object.groupBy(cases, (c) => c.name.split(' ')[0]!);
    expect(Object.keys(perFile)).toHaveLength(9);
    for (const group of Object.values(perFile)) expect(group!.length).toBeGreaterThanOrEqual(5);
  });

  it.each(cases)('$name renders nothing that could run, load or restyle', async ({ text, format }) => {
    expect(findViolations(await renderToFragment(text, format))).toEqual([]);
  });

  it('shows MDX code as text: no case leaves an element an expression or prop asked for', async () => {
    const mdx = cases.filter((c) => c.format === 'mdx');
    const fragment = await renderToFragment(mdx.map((c) => c.text).join('\n\n'), 'mdx');
    expect(fragment.textContent).not.toContain('import evil');
    // Local images wait for main's check, as in Markdown; none loads by itself.
    expect(fragment.querySelector('img[src]')).toBeNull();
    expect([...fragment.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([null, 'notes.md', null, null]);
    expect(fragment.querySelector('[data-galeo-mdx="Foo"]')?.textContent).toContain('"><img src=x onerror=window.__galeoPwned=1>');
    // Parsing MDX runs none of it: every case would set this flag.
    expect((globalThis as { __galeoPwned?: unknown }).__galeoPwned).toBeUndefined();
  });

  it('drops the contents of stripped elements instead of showing them as text', async () => {
    const fragment = await renderToFragment(
      '<style>@import url(x)</style><script>var x = 1</script><iframe>frame text</iframe><textarea>area</textarea>',
    );
    expect(fragment.textContent?.trim()).toBe('');
  });

  it('keeps only http, https, mailto and relative link targets', async () => {
    const { links } = await render.markdown(cases.find((c) => c.name === 'links.payloads.md #7')!.text);
    expect(links).toEqual(['https://ok.example/allowed', 'mailto:someone@example.org', 'notes/other.md', '#heading']);
    const hostile = await render.markdown(cases.filter((c) => c.name.startsWith('links.')).map((c) => c.text).join('\n\n'));
    for (const link of hostile.links) expect(link).toMatch(/^(https?:|mailto:|[^:]*$)/);
  });

  it('treats protocol-relative and backslash image sources as remote', async () => {
    const { images, html } = await render.markdown(
      '![a](//tracker.example/a.png) <img src="\\\\tracker.example\\b.png"> <img src=" /\\tracker.example/c.png"> ![d](img/d.png)',
    );
    expect(images).toEqual(['img/d.png']);
    expect(html.match(/class="galeo-remote-image"/g)).toHaveLength(3);
  });

  it('keeps KaTeX from emitting links, author styles or ids', async () => {
    const katex = cases.filter((c) => c.name.startsWith('katex.')).map((c) => c.text).join('\n\n');
    const fragment = await renderToFragment(katex);
    expect(fragment.querySelectorAll('a')).toHaveLength(0);
    expect(fragment.querySelector('[id]')).toBeNull();
    expect(fragment.querySelector('.galeo-fake')).toBeNull();
    // Local images wait for main's check, as in Markdown; none loads by itself.
    expect(fragment.querySelector('img[src]')).toBeNull();
  });
});
