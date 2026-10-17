import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCsv, type CsvParse, type Separator } from '../../shared/csv';
import { RENDER_ANYWAY_BUDGET_MS, RenderCancelled, RenderTimeout, TABLE_BUDGET_MS, type RenderClient } from '../worker/client';
import { useCsvTable } from './useCsvTable';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
});

/** A worker whose table jobs finish only when the test says. */
function manualClient() {
  const pending: { text: string; separator: string; budgetMs: number | undefined; live: boolean | undefined; signal: AbortSignal | undefined; resolve: (result: CsvParse) => void; reject: (error: Error) => void }[] = [];
  const client = {
    table: (text: string, options: { separator: string; budgetMs?: number; live?: boolean; signal?: AbortSignal }) =>
      new Promise<CsvParse>((resolve, reject) => pending.push({ text, separator: options.separator, budgetMs: options.budgetMs, live: options.live, signal: options.signal, resolve, reject })),
  } as unknown as RenderClient;
  return { client, pending };
}

type Options = { separator?: Separator | 'sniff'; readerAsked?: boolean; live?: boolean };

async function mount(client: RenderClient, text: string, options: Options = {}) {
  const seen: ReturnType<typeof useCsvTable>[] = [];
  function Probe({ text, options }: { text: string; options: Options }) {
    seen.push(useCsvTable(client, text, true, { separator: 'sniff', ...options }));
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root!.render(<Probe text={text} options={options} />));
  return { latest: () => seen.at(-1)!, rerender: (next: string, nextOptions: Options = options) => act(async () => root!.render(<Probe text={next} options={nextOptions} />)) };
}

const parsed = (text: string) => parseCsv(text, ',');

describe('useCsvTable', () => {
  it('asks the worker for the table with its separator, on the table budget', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, 'a;b', { separator: 'sniff' });
    expect(pending.map(({ separator, budgetMs }) => [separator, budgetMs])).toEqual([['sniff', TABLE_BUDGET_MS]]);
    await act(async () => pending[0]!.resolve(parsed('a,b\n1,2\n')));
    const state = probe.latest();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && [state.text, state.table.rows]).toEqual(['a;b', 2]);
  });

  it("waits Render anyway's budget when the reader asked for the table, or asks for it again", async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, 'x', { readerAsked: true });
    expect(pending[0]!.budgetMs).toBe(RENDER_ANYWAY_BUDGET_MS);
    await probe.rerender('y', {});
    await act(async () => pending[1]!.reject(new RenderTimeout(TABLE_BUDGET_MS)));
    expect(probe.latest()).toMatchObject({ status: 'failed', reason: 'slow' });
    await act(async () => probe.latest().showAnyway());
    expect(pending[2]!.budgetMs).toBe(RENDER_ANYWAY_BUDGET_MS);
  });

  it('passes on a file too large for a table, and a cancel', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, 'x');
    await act(async () => pending[0]!.resolve({ state: 'too-large' }));
    expect(probe.latest().status).toBe('too-large');
    await probe.rerender('z');
    await act(async () => probe.latest().cancel());
    expect(pending[1]!.signal?.aborted).toBe(true);
    await act(async () => pending[1]!.reject(new RenderCancelled()));
    expect(probe.latest()).toMatchObject({ status: 'failed', reason: 'cancelled' });
  });

  it('keeps the last good table while a live preview of typing fails or waits', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, 'a,b\n', { live: true });
    expect(pending[0]!.live).toBe(true);
    await act(async () => pending[0]!.resolve(parsed('a,b\n')));
    await probe.rerender('a,b\n1');
    expect(probe.latest()).toMatchObject({ status: 'pending', text: 'a,b\n' });
    await act(async () => pending[1]!.reject(new RenderTimeout(TABLE_BUDGET_MS)));
    expect(probe.latest()).toMatchObject({ status: 'paused', reason: 'slow', text: 'a,b\n' });
  });

  it('reads the same text again with a new separator (ADR-021)', async () => {
    const { client, pending } = manualClient();
    const probe = await mount(client, 'a;b', { separator: 'sniff' });
    await act(async () => pending[0]!.resolve(parsed('a;b\n')));
    await probe.rerender('a;b', { separator: ',' });
    expect(pending.map(({ separator }) => separator)).toEqual(['sniff', ',']);
    expect(probe.latest().status).toBe('pending');
  });
});
