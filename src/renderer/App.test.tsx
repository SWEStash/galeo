import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeWorker extends EventTarget {
  postMessage(message: unknown) {
    if (message === 'ping') {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: 'ready' })));
    }
  }
  terminate() {}
}

vi.mock('./worker/spawn', () => ({ spawnRenderWorker: () => new FakeWorker() }));

describe('App', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('marks the root ready once the render worker answers the handshake', async () => {
    const { App } = await import('./App');
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      createRoot(container).render(<App />);
    });

    expect(container.querySelector('[data-testid="app-root"]')?.getAttribute('data-worker')).toBe('ready');
  });
});
