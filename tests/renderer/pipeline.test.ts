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

  it("marks each positioned block's last source line, so a long block can be followed inside", async () => {
    const ends = (doc: DocumentFragment, selector: string) =>
      [...doc.querySelectorAll(selector)].map((element) => element.getAttribute('data-src-end'));
    const basic = dom((await render.markdown(fixture('basic.md'))).html);
    expect(ends(basic, 'h1, p, h2, li, blockquote')).toEqual(['1', '3', '5', '7', '8', '10', '10']);
    // Highlighting replaces the block, which must keep both lines.
    expect(ends(basic, 'pre.shiki')).toEqual(['14']);
    expect(ends(dom((await render.markdown(fixture('gfm.md'))).html), 'table, tbody tr')).toEqual(['6', '5', '6']);
    const frontmatter = dom((await render.markdown(fixture('frontmatter.md'))).html);
    expect(ends(frontmatter, 'details.galeo-frontmatter')).toEqual(['4']);
    const diagram = dom((await render.markdown('# Flow\n\n```mermaid\ngraph TD\n  A --> B\n```\n')).html);
    expect(ends(diagram, 'div.galeo-diagram')).toEqual(['6']);
    expect(diagram.querySelector('div.galeo-diagram pre')?.hasAttribute('data-src-end')).toBe(false);
  });

  it('counts the prose words only: not code blocks, math, diagrams, front matter or blocked images', async () => {
    const text = [
      '---',
      'title: Not counted here',
      '---',
      '',
      '# Two words',
      '',
      'Some *emphasised* prose with `inline code`.',
      '',
      '```js',
      'const notCounted = 1;',
      '```',
      '',
      '$$',
      'x^2 + y^2',
      '$$',
      '',
      'Inline $a+b$ math, and a ![remote](https://example.com/x.png) image.',
      '',
      '| Cell one | Cell two |',
      '|---|---|',
      '| three | four |',
      '',
      '```mermaid',
      'graph TD; Alpha-->Beta',
      '```',
      '',
      'Last<br>line',
    ].join('\n');
    const { words } = await render.markdown(text);
    // 2 + 6 + 5 ("Inline math, and a image") + 6 (table) + 2.
    expect(words).toBe(21);
  });

  it('builds the outline from the headings', async () => {
    const { outline } = await render.markdown(fixture('basic.md'));
    expect(outline).toEqual([
      { depth: 1, text: 'galeo basic fixture', id: 'user-content-galeo-basic-fixture', line: 1 },
      { depth: 2, text: 'Second heading', id: 'user-content-second-heading', line: 5 },
    ]);
  });

  it('renders GFM: table rows carry their source lines, and footnotes survive the sanitizer', async () => {
    const doc = dom((await render.markdown(fixture('gfm.md'))).html);
    expect([...doc.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-src-line'))).toEqual(['5', '6']);
    expect(doc.querySelector('section[data-footnotes] li')?.textContent).toContain('The footnote text.');
  });

  it('draws code in the accessible shades of the themes, never the low-contrast originals', async () => {
    const { html } = await render.markdown('```ts\nconst greeting = "hello";\n```\n');
    expect(html.toLowerCase()).toContain('--shiki-light:#cf222e');
    expect(html.toLowerCase()).not.toContain('#d73a49');
  });

  it("names each task-list checkbox after its own item's text, not its sub-items'", async () => {
    const doc = dom((await render.markdown('- [x] Write the *plan*\n  - [ ] nested step\n\n- [ ] Ship it\n')).html);
    expect([...doc.querySelectorAll('input[type="checkbox"]')].map((box) => box.getAttribute('aria-label'))).toEqual([
      'Write the plan',
      'nested step',
      'Ship it',
    ]);
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

  it('typesets math rather than leaving it as code', async () => {
    const doc = dom((await render.markdown(fixture('math.md'))).html);
    expect(doc.querySelector('code.language-math')).toBeNull();
    expect(doc.querySelector('.katex-display')).not.toBeNull();
  });

  it('says whether a document has math, so the page loads the math styles only then', async () => {
    expect((await render.markdown(fixture('math.md'))).math).toBe(true);
    expect((await render.markdown(fixture('basic.md'))).math).toBe(false);
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

  it('leaves a Mermaid block to the page as a diagram placeholder holding its source, never highlighted', async () => {
    const source = 'graph TD\n  A[Start] --- B{Done?}\n';
    const doc = dom((await render.markdown(`# Flow\n\n\`\`\`mermaid\n${source}\`\`\`\n\n\`\`\`ts\nconst a = 1;\n\`\`\`\n`)).html);
    const diagram = doc.querySelector('div.galeo-diagram');
    expect(diagram?.getAttribute('data-src-line')).toBe('3');
    // The source shows as plain code until the page draws it.
    expect(diagram?.querySelector('pre > code')?.textContent).toBe(source);
    expect(diagram?.querySelector('.shiki')).toBeNull();
    // Other code blocks are still highlighted, each keeping its own line.
    expect(doc.querySelector('pre.shiki')?.getAttribute('data-src-line')).toBe('8');
  });

  it('keeps markup in a diagram source as text', async () => {
    const { html } = await render.markdown('```mermaid\ngraph TD\n  A[<script>x()</script>] --> B\n```\n');
    expect(html).toContain('A[&#x3C;script>x()&#x3C;/script>]');
    expect(html).not.toContain('<script');
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

  it('neither reads nor fills the cache for a render that skips it (typing in split)', async () => {
    const renderer = createRenderer({ cacheEntries: 2 });
    await renderer.markdown('# kept');
    expect((await renderer.markdown('# kept', { cache: false })).cached).toBe(false);
    await renderer.markdown('# typed', { cache: false });
    expect((await renderer.markdown('# typed')).cached).toBe(false);
    // The live render didn't push the earlier entry out.
    expect((await renderer.markdown('# kept')).cached).toBe(true);
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

  it('never loads WebAssembly', async () => {
    const compile = vi.spyOn(WebAssembly, 'compile');
    const instantiate = vi.spyOn(WebAssembly, 'instantiate');
    await createRenderer().markdown('```ts\nlet a = 1\n```\n\n```python\nb = 2\n```\n');
    expect(compile).not.toHaveBeenCalled();
    expect(instantiate).not.toHaveBeenCalled();
  });
});

describe('MDX pipeline', () => {
  const mdx = async (text: string) => render.markdown(text, { format: 'mdx' });

  it('hides imports and exports, and renders the Markdown around them', async () => {
    const { html, outline } = await mdx(fixture('article.mdx'));
    const doc = dom(html);
    expect(doc.textContent).not.toContain('import Callout');
    expect(doc.textContent).not.toContain('export const');
    expect(doc.querySelector('details.galeo-frontmatter')).not.toBeNull();
    expect(outline.map((entry) => entry.text)).toEqual(['An MDX article']);
  });

  it('shows a component as a labelled box listing its props, with its children rendered inside', async () => {
    const doc = dom((await mdx(fixture('article.mdx'))).html);
    const box = doc.querySelector('div[data-galeo-mdx="Callout"]')!;
    expect(box.querySelector('code[data-galeo-mdx="name"]')?.textContent).toBe('<Callout>');
    const props = [...box.querySelectorAll('dl[data-galeo-mdx="props"] > *')].map((node) => node.textContent);
    expect(props).toEqual(['type', '"warning"', 'open', 'true', 'count', '{3}', '{...rest}']);
    expect(box.querySelector('strong')?.textContent).toBe('bold');
    expect(box.querySelector('a')?.getAttribute('href')).toBe('basic.md');
    expect(box.getAttribute('data-src-line')).toBe('9');
    expect(box.getAttribute('data-src-end')).toBe('11');
  });

  it('shows an inline component as an inline label', async () => {
    const doc = dom((await mdx(fixture('article.mdx'))).html);
    expect(doc.querySelector('span[data-galeo-mdx="Badge"] code[data-galeo-mdx="name"]')?.textContent).toBe('<Badge label="new" />');
  });

  it('shows expressions as code and hides comment-only ones; nothing is evaluated', async () => {
    const doc = dom((await mdx(fixture('article.mdx'))).html);
    const expressions = [...doc.querySelectorAll('[data-galeo-mdx="expression"]')].map((node) => [node.tagName, node.textContent]);
    expect(expressions).toEqual([
      ['CODE', '{year}'],
      ['PRE', '{items.map((item) => item.name)}'],
    ]);
    expect(doc.textContent).not.toContain('A comment');
  });

  it('renders lowercase HTML tags as HTML, through the same sanitizer and link set as Markdown', async () => {
    const { html, links, images } = await mdx(fixture('article.mdx'));
    const doc = dom(html);
    expect(doc.querySelector('img[alt="A red dot"]')?.getAttribute('data-galeo-src')).toBe('images/red-dot.png');
    expect([...doc.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['a link', 'A link written as HTML']);
    // A component's `href` and `src` are props, shown as text: never a link or an image.
    expect(links).toEqual(['basic.md']);
    expect(images).toEqual(['images/red-dot.png']);
  });

  it('keeps an HTML attribute value whole, quotes and all', async () => {
    const doc = dom((await mdx(`<a href="a.md" title='"><b>no</b> & more'>t</a>\n`)).html);
    expect(doc.querySelector('a')?.getAttribute('title')).toBe('"><b>no</b> & more');
    expect(doc.querySelector('b')).toBeNull();
  });

  it('counts the prose inside components, not their names, props or expressions', async () => {
    const { words } = await mdx('<Callout type="note">Two words</Callout>\n\n{one + two}\n');
    expect(words).toBe(2);
  });

  it('fails with the line of an MDX syntax error', async () => {
    await expect(mdx('# Fine\n\nA stray <3 here\n')).rejects.toMatchObject({ line: 3, reason: expect.stringMatching(/^Unexpected character/) });
  });

  it('parses the same text as Markdown or MDX by its format, each cached apart', async () => {
    const renderer = createRenderer();
    const text = '<Callout>x</Callout>\n';
    const asMdx = await renderer.markdown(text, { format: 'mdx' });
    const asMarkdown = await renderer.markdown(text);
    expect(asMarkdown.cached).toBe(false);
    expect(dom(asMdx.html).querySelector('[data-galeo-mdx="Callout"]')).not.toBeNull();
    expect(dom(asMarkdown.html).querySelector('[data-galeo-mdx]')).toBeNull();
  });
});
