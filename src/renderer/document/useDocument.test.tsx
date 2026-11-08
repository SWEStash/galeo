import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentContent, ReadReply } from '../../shared/contracts';
import { useDocument } from './useDocument';

const ready = (text: string, version: string): DocumentContent => ({
  state: 'ready',
  path: '/d/a.log',
  format: 'log',
  view: 'source',
  banner: null,
  text,
  encoding: 'utf-8',
  guessedEncoding: false,
  size: text.length,
  version,
});

/** A main that answers each read with the next reply, and records what the page said it holds. */
function fakeMain(replies: ReadReply[]) {
  const held: (string | null)[] = [];
  const read = vi.fn(async (_id: string, version: string | null) => {
    held.push(version);
    const reply = replies.shift();
    if (!reply) throw new Error('no reply left');
    return reply;
  });
  vi.stubGlobal('galeo', { documents: { read } });
  return { held };
}

const say = () => {};

async function mount() {
  let result!: ReturnType<typeof useDocument>;
  function Probe({ stale }: { stale: number }) {
    result = useDocument('t1', stale, say);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe stale={0} />));
  return {
    content: () => result.document?.content,
    changed: async (stale: number) => act(async () => root.render(<Probe stale={stale} />)),
    unmount: () => act(() => root.unmount()),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useDocument: reads after a change (ADR-033)', () => {
  it('names the version it shows, and joins an append to its text', async () => {
    const main = fakeMain([
      ready('one\n', 'v1'),
      { state: 'appended', path: '/d/a.log', base: 'v1', text: 'two\n', size: 8, version: 'v2' },
    ]);
    const view = await mount();
    await view.changed(1);
    expect(main.held).toEqual([null, 'v1']);
    expect(view.content()).toEqual({ ...ready('one\ntwo\n', 'v2'), size: 8, grownFrom: 4 });
    view.unmount();
  });

  it('reads in full when an append is for a version it no longer shows', async () => {
    const main = fakeMain([
      ready('one\n', 'v1'),
      { state: 'appended', path: '/d/a.log', base: 'v0', text: 'two\n', size: 8, version: 'v2' },
      ready('one\ntwo\n', 'v2'),
    ]);
    const view = await mount();
    await view.changed(1);
    expect(main.held).toEqual([null, 'v1', null]);
    expect(view.content()).toEqual(ready('one\ntwo\n', 'v2'));
    view.unmount();
  });

  it('keeps its document as it is when nothing was added', async () => {
    fakeMain([ready('one\n', 'v1'), { state: 'appended', path: '/d/a.log', base: 'v1', text: '', size: 4, version: 'v1' }]);
    const view = await mount();
    const before = view.content();
    await view.changed(1);
    expect(view.content()).toBe(before);
    view.unmount();
  });
});
