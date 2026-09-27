import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDocumentHost } from './host';

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
