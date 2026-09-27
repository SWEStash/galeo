import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppInfo, GaleoApi } from '../shared/contracts';

class FakeWorker extends EventTarget {
  postMessage(message: unknown) {
    if (message === 'ping') {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: 'ready' })));
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

function stubBridge(info: Partial<AppInfo> = {}) {
  const api = {
    app: {
      info: vi.fn().mockResolvedValue({ ...baseInfo, ...info }),
      resolveSandboxUnavailable: vi.fn().mockResolvedValue(undefined),
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

  it('shows only the sandbox choice and sends it to main', async () => {
    const api = stubBridge({ sandboxed: false, sandboxUnavailable: 'suid-helper' });
    const container = await renderApp();
    expect(container.querySelector('[data-testid="app-root"]')).toBeNull();
    const quit = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Quit');
    await act(async () => quit?.click());
    expect(api.app.resolveSandboxUnavailable).toHaveBeenCalledWith('quit');
  });
});
