import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppInfo, GaleoApi, DocumentContent, DocumentRecord } from '../shared/contracts';

class FakeWorker extends EventTarget {
  postMessage(message: unknown) {
    const reply = (data: unknown) => queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data })));
    if (message === 'ping') reply('ready');
    const request = message as { type?: string; id: number; text: string };
    if (request.type === 'render') {
      const result = { html: `<p>${request.text}</p>`, outline: [], links: [], images: [], ms: 1, cached: false };
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
    },
  } satisfies GaleoApi;
  Object.defineProperty(window, 'galeo', { value: api, configurable: true });
  return api;
}

async function renderApp() {
  const { App } = await import('./App');
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(<App />);
  });
  return container;
}

describe('App', () => {
  afterEach(() => {
    document.body.innerHTML = '';
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

  it('shows the state of a document that cannot be rendered', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/gone.md' }], content: { state: 'missing', path: '/d/gone.md' } });
    const container = await renderApp();
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="document-state"]')?.getAttribute('data-state')).toBe('missing'),
    );
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
