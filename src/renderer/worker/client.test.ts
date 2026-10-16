import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderClient, RENDER_BUDGET_MS, RenderSuperseded, RenderSyntaxError, RenderTimeout } from './client';
import type { CsvParse } from '../../shared/csv';
import type { RenderRequest, WorkerReply } from './handler';
import type { RenderResult } from './pipeline/render';

const result = (html: string): RenderResult => ({ html, math: false, outline: [], links: [], images: [], words: 0, ms: 1, cached: false });

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
    expect(worker.requests).toEqual([{ type: 'render', kind: 'article', id: 1, format: 'markdown', text: '# a' }]);
    worker.reply({ type: 'rendered', id: 1, result: result('<h1>a</h1>') });
    expect((await pending).html).toBe('<h1>a</h1>');
  });

  it('sends MDX with its format', async () => {
    const { client, current } = clientWithWorkers();
    void client.markdown('<A />', { format: 'mdx' });
    expect(current().requests).toEqual([{ type: 'render', kind: 'article', id: 1, format: 'mdx', text: '<A />' }]);
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

  it("rejects a syntax error with its line, apart from other failures", async () => {
    const { client, current } = clientWithWorkers();
    const pending = client.markdown('a <3', { format: 'mdx' });
    current().reply({ type: 'failed', id: 1, message: 'Unexpected character', line: 3 });
    const error = await pending.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(RenderSyntaxError);
    expect(error).toMatchObject({ line: 3, message: 'Unexpected character' });
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

  describe('live renders (typing in split)', () => {
    it('skips the worker cache', () => {
      const { client, current } = clientWithWorkers();
      void client.markdown('a', { live: true });
      expect(current().requests).toEqual([{ type: 'render', kind: 'article', id: 1, format: 'markdown', text: 'a', noCache: true }]);
    });

    it('sends only the latest text once the worker is done with the one it has', async () => {
      const { client, current } = clientWithWorkers();
      const worker = current();
      const first = client.markdown('a', { live: true });
      const dropped = client.markdown('ab', { live: true });
      const latest = client.markdown('abc', { live: true });
      expect(worker.requests.map((request) => request.text)).toEqual(['a']);
      await expect(dropped).rejects.toBeInstanceOf(RenderSuperseded);
      worker.reply({ type: 'rendered', id: 1, result: result('a') });
      expect((await first).html).toBe('a');
      expect(worker.requests.map((request) => request.text)).toEqual(['a', 'abc']);
      worker.reply({ type: 'rendered', id: worker.requests[1]!.id, result: result('abc') });
      expect((await latest).html).toBe('abc');
    });

    it('holds back no other render', () => {
      const { client, current } = clientWithWorkers();
      void client.markdown('a', { live: true });
      void client.markdown('other tab');
      expect(current().requests.map((request) => request.text)).toEqual(['a', 'other tab']);
    });

    it('sends the waiting text to the fresh worker when the one it waited for runs over budget', async () => {
      vi.useFakeTimers();
      const { client, current } = clientWithWorkers();
      const slow = client.markdown('a', { live: true });
      const latest = client.markdown('ab', { live: true });
      const timedOut = expect(slow).rejects.toBeInstanceOf(RenderTimeout);
      vi.advanceTimersByTime(RENDER_BUDGET_MS);
      await timedOut;
      expect(current().requests).toEqual([expect.objectContaining({ text: 'ab', noCache: true })]);
      current().reply({ type: 'rendered', id: current().requests[0]!.id, result: result('ab') });
      expect((await latest).html).toBe('ab');
    });
  });

  describe('table jobs', () => {
    const parsed: CsvParse = { state: 'too-large' };

    it('sends a table job with its separator and resolves with the parse', async () => {
      const { client, current } = clientWithWorkers();
      const pending = client.table('a;b', { separator: 'sniff' });
      expect(current().requests).toEqual([{ type: 'render', kind: 'table', id: 1, separator: 'sniff', text: 'a;b' }]);
      current().reply({ type: 'table', id: 1, result: parsed });
      expect(await pending).toEqual(parsed);
    });

    it('holds a table job to the same budget, replacing the worker past it', async () => {
      vi.useFakeTimers();
      const { client, workers } = clientWithWorkers();
      const refused = expect(client.table('huge', { separator: ',' })).rejects.toBeInstanceOf(RenderTimeout);
      vi.advanceTimersByTime(RENDER_BUDGET_MS);
      await refused;
      expect(workers[0]!.terminated).toBe(true);
      expect(workers).toHaveLength(2);
    });
  });

  describe('JSON jobs', () => {
    it('sends a JSON job and resolves with the index', async () => {
      const { client, current } = clientWithWorkers();
      const pending = client.json('[]');
      expect(current().requests).toEqual([{ type: 'render', kind: 'json', id: 1, text: '[]' }]);
      current().reply({ type: 'json', id: 1, result: { state: 'too-large' } });
      expect(await pending).toEqual({ state: 'too-large' });
    });

    it('holds a JSON job to the same budget, replacing the worker past it', async () => {
      vi.useFakeTimers();
      const { client, workers } = clientWithWorkers();
      const refused = expect(client.json('[[[[')).rejects.toBeInstanceOf(RenderTimeout);
      vi.advanceTimersByTime(RENDER_BUDGET_MS);
      await refused;
      expect(workers[0]!.terminated).toBe(true);
      expect(workers).toHaveLength(2);
    });
  });
});
