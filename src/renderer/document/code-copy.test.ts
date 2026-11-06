import { describe, expect, it, vi } from 'vitest';
import { offerCodeCopy, richTextOf } from './code-copy';

function article(html: string) {
  const element = document.createElement('article');
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

describe('offerCodeCopy (#58)', () => {
  it("puts a named Copy button after each code block, never front matter's, and copies the block's text", () => {
    const onCopy = vi.fn();
    const root = article('<div class="galeo-frontmatter"><pre>title: x</pre></div><pre><code>npm test\nnpm run check</code></pre><p>text</p>');
    offerCodeCopy(root, onCopy);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.galeo-code-copy')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.previousElementSibling?.tagName).toBe('PRE');
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Copy code');
    expect(buttons[0]!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    buttons[0]!.click();
    expect(onCopy).toHaveBeenCalledWith('npm test\nnpm run check');
  });
});

describe('richTextOf', () => {
  it("gives the document's HTML without galeo's own buttons", () => {
    const root = article('<h1>Title</h1><pre><code>x</code></pre>');
    offerCodeCopy(root, () => {});
    expect(richTextOf(root).html).toBe('<h1>Title</h1><pre><code>x</code></pre>');
  });
});
