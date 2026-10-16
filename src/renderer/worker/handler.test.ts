import { describe, expect, it, vi } from 'vitest';
import type { Renderer, RenderResult } from './pipeline/render';
import { createMessageHandler, type WorkerReply } from './handler';

const result: RenderResult = { html: '<p>x</p>', math: false, outline: [], links: [], images: [], words: 0, ms: 1, cached: false };

function setup(renderer: Renderer, load: () => Promise<Renderer> = async () => renderer) {
  const replies: unknown[] = [];
  const handle = createMessageHandler(load, (reply: WorkerReply | 'ready') => replies.push(reply));
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
    await handle({ type: 'render', kind: 'article', id: 7, format: 'markdown', text: 'hi' });
    expect(replies).toEqual([{ type: 'rendered', id: 7, result: { ...result, html: '<p>hi</p>' } }]);
  });

  it('passes a request that skips the cache on to the renderer', async () => {
    const seen: unknown[] = [];
    const { handle } = setup({ markdown: async (_text, options) => (seen.push(options), result) });
    await handle({ type: 'render', kind: 'article', id: 1, format: 'markdown', text: 'a', noCache: true });
    await handle({ type: 'render', kind: 'article', id: 2, format: 'markdown', text: 'a' });
    expect(seen).toEqual([
      { cache: false, format: 'markdown' },
      { cache: true, format: 'markdown' },
    ]);
  });

  it('renders MDX as MDX', async () => {
    const seen: unknown[] = [];
    const { handle, replies } = setup({ markdown: async (_text, options) => (seen.push(options?.format), result) });
    await handle({ type: 'render', kind: 'article', id: 4, format: 'mdx', text: '<A />' });
    expect(seen).toEqual(['mdx']);
    expect(replies).toEqual([{ type: 'rendered', id: 4, result }]);
  });

  it('passes the line of a syntax error on, so the page can point at it', async () => {
    const { handle, replies } = setup({ markdown: async () => Promise.reject(Object.assign(new Error('Unexpected character'), { line: 3 })) });
    await handle({ type: 'render', kind: 'article', id: 5, format: 'mdx', text: 'a <3' });
    expect(replies).toEqual([{ type: 'failed', id: 5, message: 'Unexpected character', line: 3 }]);
  });

  it('reports a pipeline failure for that request instead of dying', async () => {
    const { handle, replies } = setup({ markdown: async () => Promise.reject(new Error('boom')) });
    await handle({ type: 'render', kind: 'article', id: 3, format: 'markdown', text: 'x' });
    expect(replies).toEqual([{ type: 'failed', id: 3, message: 'boom' }]);
  });

  it('loads the Markdown pipeline only for the first article, not at startup', async () => {
    const load = vi.fn(async () => ({ markdown: async () => result }));
    const { handle } = setup({ markdown: async () => result }, load);
    await handle('ping');
    expect(load).not.toHaveBeenCalled();
    await handle({ type: 'render', kind: 'article', id: 1, format: 'markdown', text: 'a' });
    await handle({ type: 'render', kind: 'article', id: 2, format: 'markdown', text: 'b' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('fails only the request whose pipeline did not load, and tries again on the next', async () => {
    const load = vi.fn<() => Promise<Renderer>>().mockRejectedValueOnce(new Error('chunk missing')).mockResolvedValue({ markdown: async () => result });
    const { handle, replies } = setup({ markdown: async () => result }, load);
    await handle({ type: 'render', kind: 'article', id: 1, format: 'markdown', text: 'a' });
    await handle({ type: 'render', kind: 'article', id: 2, format: 'markdown', text: 'a' });
    expect(replies).toEqual([
      { type: 'failed', id: 1, message: 'chunk missing' },
      { type: 'rendered', id: 2, result },
    ]);
  });

  it('reads a table with the separator asked for, handing its offsets over instead of copying them', async () => {
    const replies: unknown[] = [];
    const transfers: unknown[] = [];
    const load = vi.fn(async () => ({ markdown: async () => result }));
    const handle = createMessageHandler(load, (reply, transfer) => (replies.push(reply), transfers.push(transfer)));
    await handle({ type: 'render', kind: 'table', id: 8, separator: '\t', text: 'a,b\tc\n' });
    const reply = replies[0] as Extract<WorkerReply, { type: 'table' }>;
    expect(reply).toMatchObject({ type: 'table', id: 8, result: { state: 'table', table: { separator: '\t', rows: 1, columns: 2 } } });
    const table = reply.result.state === 'table' ? reply.result.table : null;
    expect(transfers[0]).toEqual([table!.rowStarts.buffer, table!.rowLines.buffer, table!.rowFields.buffer, table!.fieldEnds.buffer]);
    expect(load).not.toHaveBeenCalled();
  });

  it('indexes JSON, handing its arrays over instead of copying them', async () => {
    const replies: unknown[] = [];
    const transfers: unknown[] = [];
    const load = vi.fn(async () => ({ markdown: async () => result }));
    const handle = createMessageHandler(load, (reply, transfer) => (replies.push(reply), transfers.push(transfer)));
    await handle({ type: 'render', kind: 'json', id: 9, text: '{"a": [1]}' });
    const reply = replies[0] as Extract<WorkerReply, { type: 'json' }>;
    expect(reply).toMatchObject({ type: 'json', id: 9, result: { state: 'tree', tree: { nodes: 3 } } });
    const tree = reply.result.state === 'tree' ? reply.result.tree : null;
    expect(transfers[0]).toHaveLength(9);
    expect(transfers[0]).toContain(tree!.places.buffer);
    expect(load).not.toHaveBeenCalled();
  });

  it('replies to invalid JSON with where it breaks, and transfers nothing', async () => {
    const replies: unknown[] = [];
    const transfers: unknown[] = [];
    const handle = createMessageHandler(async () => ({ markdown: async () => result }), (reply, transfer) => (replies.push(reply), transfers.push(transfer)));
    await handle({ type: 'render', kind: 'json', id: 2, text: '[1,]' });
    expect(replies).toMatchObject([{ type: 'json', id: 2, result: { state: 'invalid', line: 1, column: 4 } }]);
    expect(transfers).toEqual([[]]);
  });

  it('ignores messages it does not know', async () => {
    const { handle, replies } = setup({ markdown: async () => result });
    await handle({ type: 'render', kind: 'article', id: 'x', text: 1 });
    await handle({ type: 'render', id: 1, format: 'markdown', text: 'x' });
    await handle({ type: 'render', kind: 'sql', id: 1, format: 'markdown', text: 'x' });
    await handle({ type: 'render', kind: 'article', id: 1, format: 'text', text: 'x' });
    await handle({ type: 'render', kind: 'table', id: 1, separator: '|', text: 'x' });
    await handle({ type: 'render', kind: 'json', id: 1, text: 2 });
    await handle(null);
    expect(replies).toEqual([]);
  });
});
