import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { indexJson, type JsonParse } from '../../shared/json-index';
import { RENDER_ANYWAY_BUDGET_MS, RenderCancelled, RenderTimeout, type RenderClient } from '../worker/client';
import { useJsonTree } from './useJsonTree';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
});

/** A worker whose JSON jobs finish only when the test says. */
function manualClient() {
  const pending: { text: string; budgetMs: number | undefined; signal: AbortSignal | undefined; resolve: (result: JsonParse) => void; reject: (error: Error) => void }[] = [];
  const client = {
    json: (text: string, options?: { budgetMs?: number; signal?: AbortSignal }) =>
      new Promise<JsonParse>((resolve, reject) => pending.push({ text, budgetMs: options?.budgetMs, signal: options?.signal, resolve, reject })),
  } as unknown as RenderClient;
  return { client, pending };
}

async function mount(client: RenderClient, text: string, options?: { readerAsked?: boolean; wanted?: boolean }) {
  const seen: ReturnType<typeof useJsonTree>[] = [];
  function Probe({ text, wanted }: { text: string; wanted: boolean }) {
    seen.push(useJsonTree(client, text, wanted, options));
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root!.render(<Probe text={text} wanted={options?.wanted ?? true} />));
  return {
    seen,
    latest: () => seen.at(-1)!,
    rerender: (next: string, wanted = true) => act(async () => root!.render(<Probe text={next} wanted={wanted} />)),
  };
}

describe('useJsonTree', () => {
  it('asks the worker for the index only once the tree is wanted', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, '[1]', { wanted: false });
    expect(pending).toHaveLength(0);
    expect(probe.latest().status).toBe('idle');
    await probe.rerender('[1]', true);
    expect(pending.map((job) => job.text)).toEqual(['[1]']);
    expect(probe.latest().status).toBe('pending');
  });

  it('gives a tree model for the index the worker sends', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, '{"a": 1}');
    await act(async () => pending[0]!.resolve(indexJson('{"a": 1}')));
    const state = probe.latest();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && Array.from(state.model.rows(), (node) => state.model.parts(node))).toEqual([
      { key: null, value: '{1 key}', type: 'object' },
      { key: 'a', value: '1', type: 'number' },
    ]);
  });

  it('passes on where invalid JSON breaks, and that a document is too large for a tree', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, '[1,]');
    await act(async () => pending[0]!.resolve(indexJson('[1,]')));
    expect(probe.latest()).toMatchObject({ status: 'invalid', line: 1, column: 4 });
    await probe.rerender('[[[]]]');
    await act(async () => pending[1]!.resolve({ state: 'too-large' }));
    expect(probe.latest().status).toBe('too-large');
  });

  it('fails a document the worker took too long over, and tries again on request', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, '[2]');
    await act(async () => pending[0]!.reject(new RenderTimeout(2000)));
    expect(probe.latest()).toMatchObject({ status: 'failed', reason: 'slow' });
    await act(async () => probe.latest().retry());
    expect(pending).toHaveLength(2);
  });

  it('waits as long as Render anyway when the reader asked for the tree', async () => {
    const { client, pending } = manualClient();
    await mount(client, '[3]', { readerAsked: true });
    expect(pending[0]!.budgetMs).toBe(RENDER_ANYWAY_BUDGET_MS);
  });

  it('keeps showing the last tree while a new version of the text is read', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, '[1]');
    await act(async () => pending[0]!.resolve(indexJson('[1]')));
    await probe.rerender('[1, 2]');
    const state = probe.latest();
    expect(state.status).toBe('pending');
    expect(state.status === 'pending' && state.model?.nodes).toBe(2);
  });

  it('cancels the read on request, and says so, until tried again', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, '[4]');
    await act(async () => probe.latest().cancel());
    expect(pending[0]!.signal?.aborted).toBe(true);
    await act(async () => pending[0]!.reject(new RenderCancelled()));
    expect(probe.latest()).toMatchObject({ status: 'failed', reason: 'cancelled' });
    await act(async () => probe.latest().retry());
    expect(pending).toHaveLength(2);
  });
});
