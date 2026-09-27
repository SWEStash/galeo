import { describe, expect, it } from 'vitest';
import type { Renderer, RenderResult } from './pipeline/render';
import { createMessageHandler, type WorkerReply } from './handler';

const result: RenderResult = { html: '<p>x</p>', outline: [], links: [], images: [], ms: 1, cached: false };

function setup(renderer: Renderer) {
  const replies: unknown[] = [];
  const handle = createMessageHandler(renderer, (reply: WorkerReply | 'ready') => replies.push(reply));
  return { handle, replies };
}

describe('render worker messages', () => {
  it('answers the startup handshake', async () => {
    const { handle, replies } = setup({ markdown: async () => result });
    await handle('ping');
    expect(replies).toEqual(['ready']);
  });

  it('renders Markdown and replies with the request id', async () => {
    const { handle, replies } = setup({ markdown: async (text) => ({ ...result, html: `<p>${text}</p>` }) });
    await handle({ type: 'render', id: 7, format: 'markdown', text: 'hi' });
    expect(replies).toEqual([{ type: 'rendered', id: 7, result: { ...result, html: '<p>hi</p>' } }]);
  });

  it('reports a pipeline failure for that request instead of dying', async () => {
    const { handle, replies } = setup({ markdown: async () => Promise.reject(new Error('boom')) });
    await handle({ type: 'render', id: 3, format: 'markdown', text: 'x' });
    expect(replies).toEqual([{ type: 'failed', id: 3, message: 'boom' }]);
  });

  it('ignores messages it does not know', async () => {
    const { handle, replies } = setup({ markdown: async () => result });
    await handle({ type: 'render', id: 'x', text: 1 });
    await handle(null);
    expect(replies).toEqual([]);
  });
});
