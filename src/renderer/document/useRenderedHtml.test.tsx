import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { RenderClient } from '../worker/client';
import { useRenderedHtml, type RenderState } from './useRenderedHtml';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
});

/** A worker whose renders finish only when the test says. */
function manualClient() {
  const pending: { text: string; resolve: (html: string) => void }[] = [];
  const client = {
    markdown: (text: string) => new Promise<{ html: string }>((resolve) => pending.push({ text, resolve: (html) => resolve({ html }) })),
  } as unknown as RenderClient;
  return { client, pending };
}

async function mount(client: RenderClient, text: string) {
  const seen: RenderState[] = [];
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

  it('has no HTML while the first render is pending', async () => {
    const { client } = manualClient();
    const { seen } = await mount(client, '# one');
    expect(seen.at(-1)).toMatchObject({ status: 'pending', html: null });
  });
});
