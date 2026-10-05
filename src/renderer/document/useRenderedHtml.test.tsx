import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RENDER_ANYWAY_BUDGET_MS, RenderTimeout, type RenderClient } from '../worker/client';
import type { OutlineEntry } from '../worker/pipeline/render';
import { useRenderedHtml } from './useRenderedHtml';

const styles = vi.hoisted(() => {
  let resolve = () => {};
  const loaded = new Promise<void>((done) => (resolve = done));
  return { load: vi.fn(() => loaded), resolve: () => resolve() };
});
vi.mock('./host', () => ({ loadMathStyles: styles.load }));

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
});

/** A worker whose renders finish only when the test says. */
function manualClient() {
  const pending: {
    text: string;
    budgetMs: number | undefined;
    resolve: (html: string, math?: boolean, outline?: OutlineEntry[]) => void;
    reject: (error: Error) => void;
  }[] = [];
  const client = {
    markdown: (text: string, options?: { budgetMs?: number }) =>
      new Promise<{ html: string; math: boolean; outline: OutlineEntry[] }>((resolve, reject) =>
        pending.push({ text, budgetMs: options?.budgetMs, reject, resolve: (html, math = false, outline = []) => resolve({ html, math, outline }) }),
      ),
  } as unknown as RenderClient;
  return { client, pending };
}

async function mount(client: RenderClient, text: string) {
  const seen: ReturnType<typeof useRenderedHtml>[] = [];
  function Probe({ text }: { text: string }) {
    seen.push(useRenderedHtml(client, text, true));
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root!.render(<Probe text={text} />));
  return { seen, rerender: (next: string) => act(async () => root!.render(<Probe text={next} />)) };
}

describe('useRenderedHtml', () => {
  it('keeps showing the last HTML while a changed text renders, then the new HTML', async () => {
    const { client, pending } = manualClient();
    const { seen, rerender } = await mount(client, '# one');
    await act(async () => pending[0]!.resolve('<h1>one</h1>'));
    expect(seen.at(-1)).toMatchObject({ status: 'done', html: '<h1>one</h1>' });
    await rerender('# two');
    expect(seen.at(-1)).toMatchObject({ status: 'pending', html: '<h1>one</h1>' });
    await act(async () => pending[1]!.resolve('<h1>two</h1>'));
    expect(seen.at(-1)).toMatchObject({ status: 'done', html: '<h1>two</h1>' });
  });

  it('says a render over its budget was too slow, and renders anyway with the longer budget', async () => {
    const { client, pending } = manualClient();
    const { seen } = await mount(client, '# big');
    expect(pending[0]!.budgetMs).toBeUndefined();
    await act(async () => pending[0]!.reject(new RenderTimeout(2000)));
    expect(seen.at(-1)).toMatchObject({ status: 'failed', reason: 'slow' });
    await act(async () => seen.at(-1)!.renderAnyway());
    expect(pending[1]).toMatchObject({ text: '# big', budgetMs: RENDER_ANYWAY_BUDGET_MS });
    expect(seen.at(-1)).toMatchObject({ status: 'pending' });
    await act(async () => pending[1]!.resolve('<h1>big</h1>'));
    expect(seen.at(-1)).toMatchObject({ status: 'done', html: '<h1>big</h1>' });
  });

  it('says a render that broke failed, and tries again with the usual budget', async () => {
    const { client, pending } = manualClient();
    const { seen } = await mount(client, '# one');
    await act(async () => pending[0]!.reject(new Error('boom')));
    expect(seen.at(-1)).toMatchObject({ status: 'failed', reason: 'error' });
    await act(async () => seen.at(-1)!.retry());
    expect(pending[1]).toMatchObject({ text: '# one', budgetMs: undefined });
  });

  it('has no HTML while the first render is pending', async () => {
    const { client } = manualClient();
    const { seen } = await mount(client, '# one');
    expect(seen.at(-1)).toMatchObject({ status: 'pending', html: null });
  });

  it('hands over a document with math once the math styles are in, and never loads them for one without', async () => {
    const { client, pending } = manualClient();
    const { seen, rerender } = await mount(client, '# plain');
    await act(async () => pending[0]!.resolve('<h1>plain</h1>'));
    expect(styles.load).not.toHaveBeenCalled();
    await rerender('$x$');
    await act(async () => pending[1]!.resolve('<span class="katex"></span>', true));
    expect(seen.at(-1)).toMatchObject({ status: 'pending', html: '<h1>plain</h1>' });
    await act(async () => styles.resolve());
    expect(seen.at(-1)).toMatchObject({ status: 'done', html: '<span class="katex"></span>' });
  });

  it("keeps the document's outline with its HTML", async () => {
    const { client, pending } = manualClient();
    const { seen } = await mount(client, '# one');
    const outline = [{ depth: 1, text: 'one', id: 'user-content-one', line: 1 }];
    await act(async () => pending[0]!.resolve('<h1>one</h1>', false, outline));
    expect(seen.at(-1)).toMatchObject({ status: 'done', outline });
  });
});
