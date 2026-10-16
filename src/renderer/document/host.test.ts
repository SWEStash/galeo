import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDocumentHost, setCustomCss } from './host';

function container(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('mountDocumentHost', () => {
  it('gives the container a shadow root with one document article', () => {
    const host = mountDocumentHost(container());
    expect(host.root.querySelectorAll('article.galeo-document')).toHaveLength(1);
  });

  it('is idempotent: mounting the same container again reuses its root and content', () => {
    const element = container();
    const first = mountDocumentHost(element);
    first.setContent('<p>kept</p>');
    const second = mountDocumentHost(element);
    expect(second.root).toBe(first.root);
    expect(second.root.querySelectorAll('article.galeo-document')).toHaveLength(1);
    expect(second.root.querySelector('p')?.textContent).toBe('kept');
  });

  it('adopts the same shared stylesheets in every document', () => {
    const a = mountDocumentHost(container());
    const b = mountDocumentHost(container());
    expect(a.root.adoptedStyleSheets.length).toBeGreaterThan(0);
    expect(b.root.adoptedStyleSheets).toEqual(a.root.adoptedStyleSheets);
    expect(a.root.adoptedStyleSheets[0]).toBe(b.root.adoptedStyleSheets[0]);
  });

  it("adopts the user's CSS after the document theme, global then profile, and updates every document live", () => {
    const a = mountDocumentHost(container());
    setCustomCss({ global: 'p { color: red; }', profile: 'p { color: blue; }' });
    const b = mountDocumentHost(container());
    const text = (sheet: CSSStyleSheet) => [...sheet.cssRules].map((rule) => rule.cssText).join(' ');
    const sheets = a.root.adoptedStyleSheets;
    expect(text(sheets.at(-2)!)).toContain('red');
    expect(text(sheets.at(-1)!)).toContain('blue');
    expect(b.root.adoptedStyleSheets).toEqual(sheets);
    setCustomCss({ global: '', profile: 'h1 { margin: 0px; }' });
    expect(text(a.root.adoptedStyleSheets.at(-2)!)).toBe('');
    expect(text(b.root.adoptedStyleSheets.at(-1)!)).toContain('margin');
  });

  it('shows one view at a time, or both side by side in split, with the rendered pane scrolling itself there', () => {
    const element = container();
    const host = mountDocumentHost(element);
    const source = host.root.querySelector<HTMLElement>('.galeo-source')!;
    host.showView('rendered');
    expect([host.article.hidden, source.hidden]).toEqual([false, true]);
    expect(host.renderedScroller).toBe(element);
    host.showView('source');
    expect([host.article.hidden, source.hidden]).toEqual([true, false]);
    host.showView('split');
    expect([host.article.hidden, source.hidden]).toEqual([false, false]);
    expect(element.dataset['view']).toBe('split');
    // Source first, on the left; the rendered pane holds the article and scrolls on its own.
    const pane = host.renderedScroller;
    expect(pane).not.toBe(element);
    expect(pane.contains(host.article)).toBe(true);
    expect(source.compareDocumentPosition(pane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    host.showView('rendered');
    expect(host.renderedScroller).toBe(element);
  });

  it('lays a split out from the top: the container no longer scrolls, so an old offset would hide the panes', () => {
    const element = container();
    const host = mountDocumentHost(element);
    host.showView('rendered');
    element.scrollTop = 120;
    host.showView('split');
    expect(element.scrollTop).toBe(0);
  });

  it("sizes a split's source pane by the divider's ratio", () => {
    const element = container();
    const host = mountDocumentHost(element);
    host.setSplitRatio(0.3);
    expect(element.style.getPropertyValue('--galeo-split-source')).toBe('30%');
  });

  it("puts a focusable separator between a split's panes, naming the source pane's share", () => {
    const host = mountDocumentHost(container());
    const divider = host.root.querySelector<HTMLElement>('[role="separator"]')!;
    expect(divider.hidden).toBe(true);
    host.showView('split');
    host.setSplitRatio(0.35);
    expect(divider.hidden).toBe(false);
    expect(divider.tabIndex).toBe(0);
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.getAttribute('aria-label')).toBe('Resize source and preview');
    expect([divider.getAttribute('aria-valuemin'), divider.getAttribute('aria-valuemax'), divider.getAttribute('aria-valuenow')]).toEqual(['20', '80', '35']);
    // Between the panes: after the source, before the rendered pane.
    expect(divider.previousElementSibling?.className).toBe('galeo-source');
    expect(divider.nextElementSibling?.className).toBe('galeo-rendered-pane');
  });

  it('moves the divider with the arrow keys and resets it with Home or a double-click', () => {
    const host = mountDocumentHost(container());
    host.showView('split');
    host.setSplitRatio(0.5);
    const moved: number[] = [];
    host.onSplitRatio((ratio) => moved.push(ratio));
    const divider = host.root.querySelector<HTMLElement>('[role="separator"]')!;
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    divider.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    divider.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const other = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    divider.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    expect(moved.map((ratio) => Math.round(ratio * 100))).toEqual([55, 50, 50]);
  });

  it('moves the divider a step per key even when keys come faster than the page passes the ratio back', () => {
    const host = mountDocumentHost(container());
    host.showView('split');
    host.setSplitRatio(0.5);
    const moved: number[] = [];
    host.onSplitRatio((ratio) => moved.push(ratio));
    const divider = host.root.querySelector<HTMLElement>('[role="separator"]')!;
    for (let i = 0; i < 3; i++) divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(moved.map((ratio) => Math.round(ratio * 100))).toEqual([45, 40, 35]);
    expect(divider.getAttribute('aria-valuenow')).toBe('35');
  });

  it('replaces the content on each update', () => {
    const host = mountDocumentHost(container());
    host.setContent('<p>one</p>');
    host.setContent('<h1>two</h1>');
    expect(host.root.querySelector('article')?.innerHTML).toBe('<h1>two</h1>');
  });

  it('inserts HTML only through the galeo-document Trusted Types policy when the platform has it', async () => {
    const createHTML = vi.fn((html: string) => ({ toString: () => html }));
    const createPolicy = vi.fn((_name: string, rules: { createHTML: (html: string) => unknown }) => ({
      createHTML: (html: string) => createHTML(String(rules.createHTML(html))),
    }));
    vi.stubGlobal('trustedTypes', { createPolicy });
    vi.resetModules();
    const { mountDocumentHost: mount } = await import('./host');
    const host = mount(container());
    host.setContent('<p>via policy</p>');
    host.setContent('<p>again</p>');
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy.mock.calls[0]![0]).toBe('galeo-document');
    expect(createHTML.mock.calls.map(([html]) => html)).toEqual(['<p>via policy</p>', '<p>again</p>']);
    expect(host.root.querySelector('p')?.textContent).toBe('again');
  });

  it('shows plain text as reader paragraphs built from text, never parsed as HTML', () => {
    const host = mountDocumentHost(container());
    host.setReaderText('first <b>not bold</b>\nsame paragraph\n\nsecond');
    const paragraphs = [...host.article.querySelectorAll('p')];
    expect(paragraphs.map((p) => [p.dataset['srcLine'], p.textContent])).toEqual([
      ['1', 'first <b>not bold</b>\nsame paragraph'],
      ['4', 'second'],
    ]);
    expect(host.article.querySelector('b')).toBeNull();
    expect(host.article.classList.contains('galeo-text-reader')).toBe(true);
    host.setContent('<p>markdown</p>');
    expect(host.article.classList.contains('galeo-text-reader')).toBe(false);
  });

  it('marks the document with the colour scheme for the code themes', () => {
    const element = container();
    const host = mountDocumentHost(element);
    host.setScheme('dark');
    expect(element.dataset['scheme']).toBe('dark');
    host.setScheme('light');
    expect(element.dataset['scheme']).toBe('light');
  });
});
