import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../src/renderer/worker/pipeline/render';
import { findViolations } from '../helpers/html-violations';

const DIR = path.resolve(import.meta.dirname, '../fixtures/payloads');

const cases = readdirSync(DIR)
  .filter((file) => file.endsWith('.payloads.md'))
  .flatMap((file) =>
    readFileSync(path.join(DIR, file), 'utf8')
      .split(/^%%%$/m)
      .map((text, index) => ({ name: `${file} #${index + 1}`, text: text.trim() })),
  );

const render = createRenderer({ cacheEntries: 0 });

async function renderToFragment(text: string): Promise<DocumentFragment> {
  const template = document.createElement('template');
  template.innerHTML = (await render.markdown(text)).html;
  return template.content;
}

describe('sanitizer payload corpus', () => {
  it('has several cases from every payload file', () => {
    const perFile = Object.groupBy(cases, (c) => c.name.split(' ')[0]!);
    expect(Object.keys(perFile)).toHaveLength(7);
    for (const group of Object.values(perFile)) expect(group!.length).toBeGreaterThanOrEqual(5);
  });

  it.each(cases)('$name renders nothing that could run, load or restyle', async ({ text }) => {
    expect(findViolations(await renderToFragment(text))).toEqual([]);
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
    expect(fragment.querySelector('img')).toBeNull();
  });
});
