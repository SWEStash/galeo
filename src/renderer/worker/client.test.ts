import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderClient, RENDER_BUDGET_MS, RenderTimeout } from './client';
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
  terminated = false;
  terminate() {
    this.terminated = true;
  }
}

/** A client over fake workers; `workers` lists every one it spawned, the current one last. */
function clientWithWorkers() {
  const workers: FakeWorker[] = [];
  const client = createRenderClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers, current: () => workers.at(-1)! };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('render client', () => {
  it('sends Markdown to the worker and resolves with its result', async () => {
    const { client, current } = clientWithWorkers();
    const worker = current();
    const pending = client.markdown('# a');
    expect(worker.requests).toEqual([{ type: 'render', id: 1, format: 'markdown', text: '# a' }]);
    worker.reply({ type: 'rendered', id: 1, result: result('<h1>a</h1>') });
    expect((await pending).html).toBe('<h1>a</h1>');
  });

  it('matches replies to requests by id, whatever their order', async () => {
    const { client, current } = clientWithWorkers();
    const worker = current();
    const first = client.markdown('one');
    const second = client.markdown('two');
    worker.reply({ type: 'rendered', id: 2, result: result('two') });
    worker.reply({ type: 'rendered', id: 1, result: result('one') });
    expect([(await first).html, (await second).html]).toEqual(['one', 'two']);
  });

  it('rejects a request the worker failed', async () => {
    const { client, current } = clientWithWorkers();
    const pending = client.markdown('x');
    const worker = current();
    worker.reply({ type: 'failed', id: 1, message: 'boom' });
    await expect(pending).rejects.toThrow('boom');
  });

  it('ignores replies for requests it never sent', async () => {
    const { client, current } = clientWithWorkers();
    const worker = current();
    worker.reply({ type: 'rendered', id: 42, result: result('stray') });
    worker.dispatchEvent(new MessageEvent('message', { data: 'ready' }));
    const pending = client.markdown('x');
    worker.reply({ type: 'rendered', id: 1, result: result('mine') });
    expect((await pending).html).toBe('mine');
  });

  describe('time budget', () => {
    it('refuses a render that runs over its budget and replaces the worker', async () => {
      vi.useFakeTimers();
      const { client, workers } = clientWithWorkers();
      const pending = client.markdown('bomb');
      const refused = expect(pending).rejects.toThrow(/took too long/);
      vi.advanceTimersByTime(RENDER_BUDGET_MS - 1);
      expect(workers).toHaveLength(1);
      vi.advanceTimersByTime(1);
      await refused;
      expect(workers[0]!.terminated).toBe(true);
      expect(workers).toHaveLength(2);
      expect(workers[1]!.terminated).toBe(false);
    });

    it('sends the requests waiting behind it to the new worker', async () => {
      vi.useFakeTimers();
      const { client, workers } = clientWithWorkers();
      const bomb = client.markdown('bomb');
      const after = client.markdown('after');
      void bomb.catch(() => {});
      vi.advanceTimersByTime(RENDER_BUDGET_MS);
      expect(workers[1]!.requests.map((request) => request.text)).toEqual(['after']);
      workers[1]!.reply({ type: 'rendered', id: workers[1]!.requests[0]!.id, result: result('after') });
      expect((await after).html).toBe('after');
    });

    it("starts a request's budget when the ones before it have answered", async () => {
      vi.useFakeTimers();
      const { client, workers } = clientWithWorkers();
      const first = client.markdown('first');
      const second = client.markdown('second');
      vi.advanceTimersByTime(RENDER_BUDGET_MS - 500);
      workers[0]!.reply({ type: 'rendered', id: 1, result: result('first') });
      await first;
      vi.advanceTimersByTime(RENDER_BUDGET_MS - 1);
      expect(workers).toHaveLength(1);
      const refused = expect(second).rejects.toThrow(/took too long/);
      vi.advanceTimersByTime(1);
      await refused;
      expect(workers).toHaveLength(2);
    });

    it('ignores what a replaced worker still sends', async () => {
      vi.useFakeTimers();
      const { client, workers } = clientWithWorkers();
      void client.markdown('bomb').catch(() => {});
      const after = client.markdown('after');
      vi.advanceTimersByTime(RENDER_BUDGET_MS);
      workers[0]!.reply({ type: 'rendered', id: 2, result: result('stale') });
      workers[1]!.reply({ type: 'rendered', id: workers[1]!.requests[0]!.id, result: result('fresh') });
      expect((await after).html).toBe('fresh');
    });

    it('tells a render over its budget apart from one that failed', async () => {
      vi.useFakeTimers();
      const { client } = clientWithWorkers();
      const pending = client.markdown('bomb');
      const refused = expect(pending).rejects.toBeInstanceOf(RenderTimeout);
      vi.advanceTimersByTime(RENDER_BUDGET_MS);
      await refused;
    });

    it('gives a request the longer budget it asks for', async () => {
      vi.useFakeTimers();
      const { client, workers } = clientWithWorkers();
      const pending = client.markdown('big', { budgetMs: 60_000 });
      vi.advanceTimersByTime(59_999);
      expect(workers).toHaveLength(1);
      const refused = expect(pending).rejects.toThrow('over 60 s');
      vi.advanceTimersByTime(1);
      await refused;
    });

    it('stops the worker when disposed', () => {
      const { client, workers } = clientWithWorkers();
      client.dispose();
      expect(workers[0]!.terminated).toBe(true);
    });
  });
});
