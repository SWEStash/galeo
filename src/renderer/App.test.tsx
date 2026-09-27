import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppInfo, GaleoApi, DocumentContent, DocumentRecord } from '../shared/contracts';

const renderRequests: string[] = [];
/** How the fake worker answers render requests. */
let workerMode: 'answer' | 'hang' | 'fail' | 'links' = 'answer';

class FakeWorker extends EventTarget {
  postMessage(message: unknown) {
    const reply = (data: unknown) => queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data })));
    if (message === 'ping') reply('ready');
    const request = message as { type?: string; id: number; text: string };
    if (request.type === 'render') {
      renderRequests.push(request.text);
      if (workerMode === 'hang') return;
      if (workerMode === 'fail') return reply({ type: 'failed', id: request.id, message: 'boom' });
      // In `links` mode, `[label](href)` becomes a link, as the real pipeline would render it.
      const html =
        workerMode === 'links'
          ? `<p>${request.text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2">$1</a>')}</p><h2 id="user-content-goals">Goals</h2>`
          : `<p>${request.text}</p>`;
      const result = { html, outline: [], links: [], images: [], ms: 1, cached: false };
      reply({ type: 'rendered', id: request.id, result });
    }
  }
  terminate() {}
}

vi.mock('./worker/spawn', () => ({ spawnRenderWorker: () => new FakeWorker() }));

const baseInfo: AppInfo = {
  name: 'galeo',
  version: '0.0.0',
  platform: 'linux',
  sandboxed: true,
  sandboxUnavailable: null,
};

function stubBridge(info: Partial<AppInfo> = {}, documents: { records?: DocumentRecord[]; content?: DocumentContent } = {}) {
  const api = {
    app: {
      info: vi.fn().mockResolvedValue({ ...baseInfo, ...info }),
      resolveSandboxUnavailable: vi.fn().mockResolvedValue(undefined),
    },
    documents: {
      list: vi.fn().mockResolvedValue(documents.records ?? []),
      read: vi.fn().mockResolvedValue(documents.content),
      followLink: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'not-in-document' }),
      back: vi.fn().mockResolvedValue({ kind: 'none' }),
      forward: vi.fn().mockResolvedValue({ kind: 'none' }),
    },
  } satisfies GaleoApi;
  Object.defineProperty(window, 'galeo', { value: api, configurable: true });
  return api;
}

function readyContent(format: 'markdown' | 'plain' | 'text' | 'log', view: 'rendered' | 'source', text: string): DocumentContent {
  return { state: 'ready', path: '/d/x', format, view, banner: null, text, encoding: 'utf-8', guessedEncoding: false, size: text.length };
}

async function documentShadow(container: HTMLElement): Promise<ShadowRoot> {
  return vi.waitFor(() => {
    const shadow = container.querySelector('[data-testid="document"]')?.shadowRoot;
    if (!shadow) throw new Error('no document yet');
    return shadow;
  });
}

async function press(init: KeyboardEventInit) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

// Every test's app is unmounted afterwards: a live one would still hear the next test's keys.
const roots: Root[] = [];

async function renderApp() {
  const { App } = await import('./App');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<App />);
  });
  return container;
}

describe('App', () => {
  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.innerHTML = '';
    renderRequests.length = 0;
    workerMode = 'answer';
    vi.restoreAllMocks();
  });

  it('marks the root ready once the render worker answers the handshake', async () => {
    stubBridge();
    const container = await renderApp();
    expect(container.querySelector('[data-testid="app-root"]')?.getAttribute('data-worker')).toBe('ready');
    expect(container.querySelector('[data-testid="unsandboxed-badge"]')).toBeNull();
  });

  it('shows the unsandboxed badge when main reports no sandbox', async () => {
    stubBridge({ sandboxed: false });
    const container = await renderApp();
    expect(container.querySelector('[data-testid="unsandboxed-badge"]')).not.toBeNull();
  });

  it('applies the system colour scheme to the app and follows it live', async () => {
    const query = Object.assign(new EventTarget(), { matches: true });
    vi.stubGlobal('matchMedia', (media: string) => (media === '(prefers-color-scheme: dark)' ? query : null));
    stubBridge();
    await renderApp();
    expect(document.documentElement.dataset['scheme']).toBe('dark');
    await act(async () => {
      query.matches = false;
      query.dispatchEvent(new Event('change'));
    });
    expect(document.documentElement.dataset['scheme']).toBe('light');
    vi.unstubAllGlobals();
  });

  it("renders the window's first document through the worker", async () => {
    const content: DocumentContent = {
      state: 'ready',
      path: '/d/a.md',
      format: 'markdown',
      view: 'rendered',
      banner: null,
      text: 'hello',
      encoding: 'utf-8',
      guessedEncoding: false,
      size: 5,
    };
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content });
    const container = await renderApp();
    await vi.waitFor(() => {
      const shadow = container.querySelector('[data-testid="document"]')?.shadowRoot;
      expect(shadow?.querySelector('article')?.innerHTML).toBe('<p>hello</p>');
    });
    expect(api.documents.read).toHaveBeenCalledWith('doc-1');
  });

  it('switches a Markdown document to its source and back with Ctrl+U', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# hi') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># hi</p>'));
    await press({ key: 'u', ctrlKey: true });
    expect(shadow.querySelector<HTMLElement>('article')?.hidden).toBe(true);
    expect(shadow.querySelector('.cm-editor')?.textContent).toContain('# hi');
    await press({ key: 'u', ctrlKey: true });
    expect(shadow.querySelector<HTMLElement>('article')?.hidden).toBe(false);
    expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(true);
  });

  it('toggles line wrapping in the source view with Alt+Z', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    expect(shadow.querySelector('.cm-lineWrapping')).toBeNull();
    await press({ key: 'z', altKey: true });
    expect(shadow.querySelector('.cm-lineWrapping')).not.toBeNull();
  });

  it('keeps a document without a rendered view in its source view on Ctrl+U', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'u', ctrlKey: true });
    expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(false);
  });

  it('renders oversized Markdown only when switched to the rendered view', async () => {
    const content = { ...readyContent('markdown', 'source', '# big'), banner: 'too-large' as const };
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/big.md' }], content });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    expect(shadow.querySelector('article')?.innerHTML).toBe('');
    expect(renderRequests).toEqual([]);
    await press({ key: 'u', ctrlKey: true });
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># big</p>'));
  });

  it('shows .txt in the reader view and its source on Ctrl+U, without the worker', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.txt' }], content: readyContent('text', 'rendered', 'a\n\nb') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelectorAll('article.galeo-text-reader p')).toHaveLength(2));
    expect(renderRequests).toEqual([]);
    await press({ key: 'u', ctrlKey: true });
    expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(false);
  });

  it('shows a log with level badges and follows its end on End until scrolled up', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/app.log' }], content: readyContent('log', 'source', 'INFO a\nERROR b\n') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.galeo-log-gutter')).not.toBeNull());
    const documentElement = container.querySelector<HTMLElement>('[data-testid="document"]')!;
    expect(documentElement.dataset['follow']).toBe('off');
    await press({ key: 'End' });
    expect(documentElement.dataset['follow']).toBe('on');
    const scroller = shadow.querySelector<HTMLElement>('.cm-scroller')!;
    await act(async () => {
      scroller.scrollTop = 100;
      scroller.dispatchEvent(new Event('scroll'));
      scroller.scrollTop = 40;
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(documentElement.dataset['follow']).toBe('off');
  });

  it('ignores End outside logs', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'End' });
    expect(container.querySelector<HTMLElement>('[data-testid="document"]')?.dataset['follow']).toBe('off');
  });

  it('opens find with Ctrl+F, counts matches as the user types, and steps with F3', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'plan\nplan\nplan') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'f', ctrlKey: true });
    const input = container.querySelector<HTMLInputElement>('.find-bar input')!;
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'plan');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const status = container.querySelector('.find-bar [role="status"]')!;
    expect(status.textContent).toBe('1 of 3');
    await press({ key: 'F3' });
    expect(status.textContent).toBe('2 of 3');
    await press({ key: 'F3', shiftKey: true });
    expect(status.textContent).toBe('1 of 3');
  });

  it('closes find with Esc, clearing the highlights and returning focus to the document', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'a a') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'f', ctrlKey: true });
    const input = container.querySelector<HTMLInputElement>('.find-bar input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'a');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(shadow.querySelectorAll('.cm-searchMatch').length).toBeGreaterThan(0);
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('.find-bar')).toBeNull();
    expect(shadow.querySelectorAll('.cm-searchMatch')).toHaveLength(0);
    expect(document.activeElement).toBe(container.querySelector('[data-testid="document"]'));
  });

  it('follows a clicked link through main, reading the document it navigated to', async () => {
    const first = readyContent('markdown', 'rendered', '[next](next.md)');
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: first });
    api.documents.read.mockResolvedValueOnce(first).mockResolvedValueOnce(readyContent('markdown', 'rendered', 'second'));
    api.documents.followLink.mockResolvedValue({ kind: 'navigated', anchor: null });
    workerMode = 'links';
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const link = await vi.waitFor(() => shadow.querySelector<HTMLAnchorElement>('a[href="next.md"]')!);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    await act(async () => link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(api.documents.followLink).toHaveBeenCalledWith('doc-1', 'next.md');
    // The navigated document is a new pane, with a new document container.
    await vi.waitFor(async () => expect((await documentShadow(container)).querySelector('article')?.textContent).toContain('second'));
    expect(api.documents.read).toHaveBeenCalledTimes(2);
  });

  it('scrolls to the anchor main confirms, by its prefixed id', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '[go](#goals)') });
    api.documents.followLink.mockResolvedValue({ kind: 'anchor', anchor: 'goals' });
    workerMode = 'links';
    const scrolled: string[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(this.id);
    });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const link = await vi.waitFor(() => shadow.querySelector<HTMLAnchorElement>('a[href="#goals"]')!);
    await act(async () => link.click());
    await vi.waitFor(() => expect(scrolled).toContain('user-content-goals'));
  });

  it('says so in the status bar when main refuses a link', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '[x](https://x.example)') });
    api.documents.followLink.mockResolvedValue({ kind: 'refused', reason: 'rate-limited' });
    workerMode = 'links';
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const link = await vi.waitFor(() => shadow.querySelector<HTMLAnchorElement>('a[href="https://x.example"]')!);
    await act(async () => link.click());
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="status-message"]')?.textContent).toBe(
        'Links open at most once a second',
      ),
    );
  });

  it('goes back and forward with Alt+Left and Alt+Right', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/b.md' }], content: readyContent('markdown', 'rendered', 'b') });
    api.documents.back.mockResolvedValue({ kind: 'navigated', anchor: null });
    const container = await renderApp();
    await documentShadow(container);
    await press({ key: 'ArrowLeft', altKey: true });
    expect(api.documents.back).toHaveBeenCalledWith('doc-1');
    await vi.waitFor(() => expect(api.documents.read).toHaveBeenCalledTimes(2));
    await press({ key: 'ArrowRight', altKey: true });
    expect(api.documents.forward).toHaveBeenCalledWith('doc-1');
  });

  it.each([
    [{ state: 'empty', path: '/d/e.md', format: 'markdown' }, 'This file is empty'],
    [{ state: 'missing', path: '/d/gone.md' }, 'File not found'],
    [{ state: 'no-permission', path: '/d/secret.md' }, "galeo can't read this file (permission denied)"],
    [{ state: 'binary', path: '/d/x.png', size: 1536 }, 'This looks like a binary file'],
    [{ state: 'not-a-file', path: '/d/folder' }, "This isn't a regular file"],
    [{ state: 'too-large', path: '/d/huge.log', maxBytes: 256 * 1024 * 1024 }, 'This file is too large to open'],
    [{ state: 'unreadable', path: '/d/odd' }, "galeo can't read this file"],
  ] as [DocumentContent, string][])('shows the %j state with its message and path', async (content, message) => {
    stubBridge({}, { records: [{ id: 'doc-1', path: content.path }], content });
    const container = await renderApp();
    const state = await vi.waitFor(() => {
      const element = container.querySelector('[data-testid="document-state"]');
      if (!element) throw new Error('no state yet');
      return element;
    });
    expect(state.getAttribute('data-state')).toBe(content.state);
    expect(state.querySelector('.document-state-title')?.textContent).toBe(message);
    expect(state.textContent).toContain(content.path);
  });

  it('gives a binary file its size and type', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/x.png' }], content: { state: 'binary', path: '/d/x.png', size: 1536 } });
    const container = await renderApp();
    await vi.waitFor(() => expect(container.querySelector('[data-testid="document-state"]')?.textContent).toContain('1.5 KB · PNG'));
  });

  it('shows oversized Markdown as source with a banner offering to render it anyway', async () => {
    const content = { ...readyContent('markdown', 'source', '# big'), banner: 'too-large' as const };
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/big.md' }], content });
    const container = await renderApp();
    const banner = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-banner="too-large"]')!);
    expect(banner.textContent).toContain('Large file shown as source');
    await act(async () => banner.querySelector('button')!.click());
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># big</p>'));
    expect(container.querySelector('[data-banner="too-large"]')).toBeNull();
  });

  it('names the guessed encoding in a banner', async () => {
    const content = { ...readyContent('text', 'rendered', 'café'), encoding: 'windows-1252' as const, guessedEncoding: true };
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/latin.txt' }], content });
    const container = await renderApp();
    await vi.waitFor(() =>
      expect(container.querySelector('[data-banner="encoding"]')?.textContent).toContain('Windows-1252'),
    );
  });

  it('falls back to the source view when rendering fails, and can try again', async () => {
    workerMode = 'fail';
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# x') });
    const container = await renderApp();
    const banner = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-banner="render-failed"]')!);
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(false));
    workerMode = 'answer';
    await act(async () => banner.querySelector('button')!.click());
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># x</p>'));
    expect(container.querySelector('[data-banner="render-failed"]')).toBeNull();
  });

  it('shows a loading skeleton only once rendering takes longer than 150 ms', async () => {
    workerMode = 'hang';
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# x') });
    const started = performance.now();
    const container = await renderApp();
    await vi.waitFor(() => expect(container.querySelector('[data-testid="document-loading"]')).not.toBeNull());
    expect(performance.now() - started).toBeGreaterThanOrEqual(140);
  });

  it('shows no skeleton for a fast render', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># x</p>'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(container.querySelector('[data-testid="document-loading"]')).toBeNull();
  });

  it('shows no document when the window has none', async () => {
    const api = stubBridge();
    const container = await renderApp();
    await vi.waitFor(() => expect(api.documents.list).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="document"]')).toBeNull();
    expect(api.documents.read).not.toHaveBeenCalled();
  });

  it('shows only the sandbox choice and sends it to main', async () => {
    const api = stubBridge({ sandboxed: false, sandboxUnavailable: 'suid-helper' });
    const container = await renderApp();
    expect(container.querySelector('[data-testid="app-root"]')).toBeNull();
    const quit = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Quit');
    await act(async () => quit?.click());
    expect(api.app.resolveSandboxUnavailable).toHaveBeenCalledWith('quit');
  });
});
