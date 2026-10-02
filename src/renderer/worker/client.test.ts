import { describe, expect, it } from 'vitest';
import { createRenderClient } from './client';
import type { RenderRequest, WorkerReply } from './handler';
import type { RenderResult } from './pipeline/render';

const result = (html: string): RenderResult => ({ html, math: false, outline: [], links: [], images: [], ms: 1, cached: false });

/** A worker that answers each request when told to, in any order. */
class FakeWorker extends EventTarget {
  readonly requests: RenderRequest[] = [];
  postMessage(message: RenderRequest) {
    this.requests.push(message);
  }
  reply(message: WorkerReply) {
    this.dispatchEvent(new MessageEvent('message', { data: message }));
  }
}

describe('render client', () => {
  it('sends Markdown to the worker and resolves with its result', async () => {
    const worker = new FakeWorker();
    const client = createRenderClient(worker);
    const pending = client.markdown('# a');
    expect(worker.requests).toEqual([{ type: 'render', id: 1, format: 'markdown', text: '# a' }]);
    worker.reply({ type: 'rendered', id: 1, result: result('<h1>a</h1>') });
    expect((await pending).html).toBe('<h1>a</h1>');
  });

  it('matches replies to requests by id, whatever their order', async () => {
    const worker = new FakeWorker();
    const client = createRenderClient(worker);
    const first = client.markdown('one');
    const second = client.markdown('two');
    worker.reply({ type: 'rendered', id: 2, result: result('two') });
    worker.reply({ type: 'rendered', id: 1, result: result('one') });
    expect([(await first).html, (await second).html]).toEqual(['one', 'two']);
  });

  it('rejects a request the worker failed', async () => {
    const worker = new FakeWorker();
    const pending = createRenderClient(worker).markdown('x');
    worker.reply({ type: 'failed', id: 1, message: 'boom' });
    await expect(pending).rejects.toThrow('boom');
  });

  it('ignores replies for requests it never sent', async () => {
    const worker = new FakeWorker();
    const client = createRenderClient(worker);
    worker.reply({ type: 'rendered', id: 42, result: result('stray') });
    worker.dispatchEvent(new MessageEvent('message', { data: 'ready' }));
    const pending = client.markdown('x');
    worker.reply({ type: 'rendered', id: 1, result: result('mine') });
    expect((await pending).html).toBe('mine');
  });
});
