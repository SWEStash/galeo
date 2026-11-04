import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../src/renderer/worker/pipeline/render';

function dom(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

const render = createRenderer();
const rendered = async (text: string, format: 'markdown' | 'mdx' = 'markdown') => dom((await render.markdown(text, { format })).html);

describe('GitHub-style callouts', () => {
  it.each([
    ['NOTE', 'note', 'Note'],
    ['TIP', 'tip', 'Tip'],
    ['IMPORTANT', 'important', 'Important'],
    ['WARNING', 'warning', 'Warning'],
    ['CAUTION', 'caution', 'Caution'],
    ['warning', 'warning', 'Warning'],
  ])('shows > [!%s] as a %s callout titled %s, without the marker', async (marker, type, title) => {
    const doc = await rendered(`> [!${marker}]\n> Back up *first*.\n`);
    const quote = doc.querySelector('blockquote')!;
    expect([...quote.classList]).toEqual(['galeo-callout', `galeo-callout-${type}`]);
    expect(quote.querySelector('p.galeo-callout-title')?.textContent).toBe(title);
    expect(quote.firstElementChild?.className).toBe('galeo-callout-title');
    expect(quote.textContent).not.toContain('[!');
    expect(quote.querySelector('em')?.textContent).toBe('first');
    // Still one positioned block, so scroll anchors and the source toggle keep working.
    expect(quote.getAttribute('data-src-line')).toBe('1');
  });

  it('keeps the paragraphs after the first one', async () => {
    const doc = await rendered('> [!TIP]\n>\n> One.\n>\n> Two.\n');
    const quote = doc.querySelector('blockquote')!;
    expect([...quote.querySelectorAll('p:not(.galeo-callout-title)')].map((p) => p.textContent)).toEqual(['One.', 'Two.']);
  });

  it('shows a callout with no body as its title alone', async () => {
    const quote = (await rendered('> [!NOTE]\n')).querySelector('blockquote')!;
    expect(quote.classList.contains('galeo-callout-note')).toBe(true);
    expect([...quote.children].map((child) => child.textContent)).toEqual(['Note']);
  });

  it('leaves a quote alone when text follows the marker on its line', async () => {
    const quote = (await rendered('> [!NOTE] not a callout\n')).querySelector('blockquote')!;
    expect(quote.className).toBe('');
    expect(quote.textContent?.trim()).toBe('[!NOTE] not a callout');
  });

  it('leaves an unknown type as a quote with its text unchanged', async () => {
    const quote = (await rendered('> [!DANGER]\n> Hot.\n')).querySelector('blockquote')!;
    expect(quote.className).toBe('');
    expect(quote.querySelector('.galeo-callout-title')).toBeNull();
    expect(quote.textContent).toContain('[!DANGER]');
  });

  it('only reads the marker at the start of the first paragraph', async () => {
    const quote = (await rendered('> Intro.\n>\n> [!NOTE]\n> Later.\n')).querySelector('blockquote')!;
    expect(quote.className).toBe('');
  });

  it('makes no callout of a quote nested in a list or another quote, as GitHub', async () => {
    const doc = await rendered('- > [!NOTE]\n  > In a list.\n\n> > [!NOTE]\n> > Nested.\n');
    expect(doc.querySelectorAll('.galeo-callout')).toHaveLength(0);
  });

  it("never keeps a document's own callout classes", async () => {
    const quote = (await rendered('<blockquote class="galeo-callout galeo-callout-warning"><p>Fake.</p></blockquote>\n')).querySelector('blockquote')!;
    expect(quote.className).toBe('');
  });

  it('works in MDX', async () => {
    const quote = (await rendered('> [!CAUTION]\n> Careful.\n', 'mdx')).querySelector('blockquote')!;
    expect(quote.classList.contains('galeo-callout-caution')).toBe(true);
  });
});
