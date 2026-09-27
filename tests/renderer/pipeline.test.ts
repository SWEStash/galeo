import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, SHIKI_MAX_BLOCK_CHARS } from '../../src/renderer/worker/pipeline/render';

const fixture = (name: string) =>
  readFileSync(path.resolve(import.meta.dirname, '../fixtures/docs', name), 'utf8');

/** Parses rendered HTML so assertions read the structure, not string details. */
function dom(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

const render = createRenderer();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Markdown pipeline', () => {
  it('renders headings with prefixed slugs and block-level source lines', async () => {
    const { html } = await render.markdown(fixture('basic.md'));
    const doc = dom(html);
    expect(doc.querySelector('h1')?.id).toBe('user-content-galeo-basic-fixture');
    expect(doc.querySelector('h1')?.getAttribute('data-src-line')).toBe('1');
    expect(doc.querySelector('p')?.getAttribute('data-src-line')).toBe('3');
    expect(doc.querySelector('h2')?.getAttribute('data-src-line')).toBe('5');
    expect([...doc.querySelectorAll('li')].map((li) => li.getAttribute('data-src-line'))).toEqual(['7', '8']);
    expect(doc.querySelector('blockquote')?.getAttribute('data-src-line')).toBe('10');
    expect(doc.querySelector('pre')?.getAttribute('data-src-line')).toBe('12');
    // Inline elements carry no positions, which keeps the HTML small.
    expect(doc.querySelector('strong')?.hasAttribute('data-src-line')).toBe(false);
    expect(doc.querySelector('a')?.hasAttribute('data-src-line')).toBe(false);
  });

  it('builds the outline from the headings', async () => {
    const { outline } = await render.markdown(fixture('basic.md'));
    expect(outline).toEqual([
      { depth: 1, text: 'galeo basic fixture', id: 'user-content-galeo-basic-fixture', line: 1 },
      { depth: 2, text: 'Second heading', id: 'user-content-second-heading', line: 5 },
    ]);
  });

  it('renders GFM tables, task lists, strikethrough, autolinks and footnotes', async () => {
    const doc = dom((await render.markdown(fixture('gfm.md'))).html);
    expect([...doc.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-src-line'))).toEqual(['5', '6']);
    expect(doc.querySelectorAll('input[type="checkbox"][disabled]')).toHaveLength(2);
    expect(doc.querySelector('del')?.textContent).toBe('struck');
    expect(doc.querySelector('a[href="https://example.com/page"]')).not.toBeNull();
    expect(doc.querySelector('section[data-footnotes] li')?.textContent).toContain('The footnote text.');
  });

  it('shows frontmatter as a collapsed, highlighted block of escaped text, outside the outline', async () => {
    const { html, outline } = await render.markdown(fixture('frontmatter.md'));
    const doc = dom(html);
    const block = doc.querySelector('details.galeo-frontmatter');
    expect(block?.hasAttribute('open')).toBe(false);
    expect(block?.querySelector('pre.shiki')).not.toBeNull();
    expect(block?.textContent).toContain('title: "Plan <script>alert(1)</script>"');
    expect(doc.querySelector('script')).toBeNull();
    expect(block?.getAttribute('data-src-line')).toBe('1');
    expect(outline.map((entry) => entry.text)).toEqual(['After the frontmatter']);
  });

  it('typesets inline and display math with KaTeX', async () => {
    const doc = dom((await render.markdown(fixture('math.md'))).html);
    expect(doc.querySelectorAll('.katex')).toHaveLength(2);
    expect(doc.querySelectorAll('.katex-display')).toHaveLength(1);
    expect(doc.querySelector('code.language-math')).toBeNull();
  });

  it('shows invalid math as an inline error box with its message and source, rendering the rest', async () => {
    const doc = dom((await render.markdown('Before $\\frac{1}{$ after\n\n$$\n\\sqrt{\n$$\n\n# Still here\n')).html);
    const errors = [...doc.querySelectorAll('.galeo-block-error')];
    expect(errors).toHaveLength(2);
    expect(errors[0]!.getAttribute('role')).toBe('note');
    expect(errors[0]!.querySelector('.galeo-block-error-message')?.textContent).toMatch(/^KaTeX parse error/);
    expect(errors[0]!.querySelector('code')?.textContent).toBe('\\frac{1}{');
    expect(errors[1]!.closest('.katex-display, div')).not.toBeNull();
    expect(doc.querySelector('.katex-error')).toBeNull();
    expect(doc.querySelector('h1')?.textContent).toBe('Still here');
  });

  it('highlights code with both themes as CSS variables, so a theme switch needs no re-render', async () => {
    const doc = dom((await render.markdown(fixture('basic.md'))).html);
    const pre = doc.querySelector('pre.shiki');
    expect(pre?.getAttribute('style')).toMatch(/--shiki-light-bg:.*--shiki-dark-bg:/);
    const token = [...doc.querySelectorAll('pre.shiki span[style]')].find((span) => span.textContent === 'const');
    expect(token?.getAttribute('style')).toMatch(/^--shiki-light:#[0-9A-F]{6};--shiki-dark:#[0-9A-F]{6}$/i);
  });

  it('shows code in an unknown language as plain text', async () => {
    const doc = dom((await render.markdown('```nosuchlang\nplain words\n```\n')).html);
    expect(doc.querySelector('pre code')?.textContent?.trimEnd()).toBe('plain words');
  });

  it('leaves code blocks over the size limit unhighlighted', async () => {
    const big = `const x = 1;\n`.repeat(Math.ceil(SHIKI_MAX_BLOCK_CHARS / 13) + 1);
    const doc = dom((await render.markdown(`\`\`\`ts\n${big}\`\`\`\n`)).html);
    expect(doc.querySelector('pre.shiki')).toBeNull();
    expect(doc.querySelector('pre code')?.textContent?.length).toBe(big.length);
  });

  it('collects the link set and the local image set, and never emits remote images', async () => {
    const markdown = [
      '[a](other.md) [b](https://example.com/x) [c](#top) [a again](other.md)',
      '',
      '![local](img/a.png) ![remote](https://tracker.example.net/pixel.gif)',
    ].join('\n');
    const { html, links, images } = await render.markdown(markdown);
    expect(links).toEqual(['other.md', 'https://example.com/x', '#top']);
    expect(images).toEqual(['img/a.png']);
    const doc = dom(html);
    expect([...doc.querySelectorAll('img')].map((img) => img.getAttribute('data-galeo-src'))).toEqual(['img/a.png']);
    expect(doc.querySelector('img[src]')).toBeNull();
    const placeholder = doc.querySelector('.galeo-remote-image');
    expect(placeholder?.getAttribute('data-host')).toBe('tracker.example.net');
    expect(placeholder?.getAttribute('data-url')).toBe('https://tracker.example.net/pixel.gif');
  });

  it('reuses the cached result for the same content', async () => {
    const renderer = createRenderer({ cacheEntries: 2 });
    const first = await renderer.markdown('# cached');
    const second = await renderer.markdown('# cached');
    expect(first.cached).toBe(false);
    expect(second).toEqual({ ...first, cached: true });
  });

  it('evicts the least recently used result when the cache is full', async () => {
    const renderer = createRenderer({ cacheEntries: 2 });
    await renderer.markdown('# a');
    await renderer.markdown('# b');
    await renderer.markdown('# a');
    await renderer.markdown('# c');
    expect((await renderer.markdown('# a')).cached).toBe(true);
    expect((await renderer.markdown('# b')).cached).toBe(false);
  });

  it('reports the parse time', async () => {
    const { ms } = await createRenderer().markdown('# timed');
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('never loads WebAssembly', async () => {
    const compile = vi.spyOn(WebAssembly, 'compile');
    const instantiate = vi.spyOn(WebAssembly, 'instantiate');
    await createRenderer().markdown('```ts\nlet a = 1\n```\n\n```python\nb = 2\n```\n');
    expect(compile).not.toHaveBeenCalled();
    expect(instantiate).not.toHaveBeenCalled();
  });
});
