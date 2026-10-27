import { act, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { FindResult } from '../../shared/find';
import type { DocumentHandle } from './DocumentView';
import { useFind } from './useFind';

const hit = (current: number): FindResult => ({ current, total: 3, capped: false });

async function mount() {
  const handle = {
    find: vi.fn(() => hit(1)),
    step: vi.fn(() => hit(2)),
    replace: vi.fn(() => hit(1)),
    replaceAll: vi.fn(() => 3),
    clear: vi.fn(),
    focus: vi.fn(),
  };
  const ref = { current: handle } as unknown as RefObject<DocumentHandle | null>;
  let find!: ReturnType<typeof useFind>;
  function Probe() {
    find = useFind(ref);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
  const run = async (action: () => void) => act(async () => action());
  return { handle, run, get: () => find, unmount: () => act(() => root.unmount()) };
}

describe('useFind', () => {
  it('opens, runs the search from a line in the document and steps on without the line', async () => {
    const { handle, run, get, unmount } = await mount();
    await run(() => get().openFind());
    expect(get().find).toMatchObject({ open: true, replace: false, token: 1 });
    await run(() => get().runFind('cat', true, 7));
    expect(handle.find).toHaveBeenCalledWith('cat', { caseSensitive: true, line: 7 });
    expect(get().findResult).toEqual(hit(1));
    await run(() => get().stepFind(1));
    expect(get().find.line).toBeUndefined();
    expect(get().findResult).toEqual(hit(2));
    unmount();
  });

  it('opens on a match chosen in find in all tabs, and seeds the bar with it', async () => {
    const { run, get, unmount } = await mount();
    const request = { query: 'dog', caseSensitive: false, line: 4, token: 9 };
    await run(() => get().openFindOn(request));
    expect(get().find).toMatchObject({ open: true, query: 'dog', line: 4, token: 1 });
    expect(get().findSeed).toBe(request);
    unmount();
  });

  it('shows what Replace all did until find moves on, and drops the replace row on leaving edit mode', async () => {
    const { run, get, unmount } = await mount();
    await run(() => get().openFind({ replace: true }));
    await run(() => get().replaceAll('x'));
    expect(get().replaced).toBe(3);
    await run(() => get().runFind('y', false));
    expect(get().replaced).toBeNull();
    await run(() => get().endReplace());
    expect(get().find).toMatchObject({ open: true, replace: false });
    unmount();
  });

  it('closes: clears the matches, forgets the query and the seed, and gives focus back to the document', async () => {
    const { handle, run, get, unmount } = await mount();
    await run(() => get().openFindOn({ query: 'dog', caseSensitive: false, line: 4, token: 9 }));
    await run(() => get().closeFind());
    expect(get().find).toMatchObject({ open: false, replace: false, query: '' });
    expect(get().findSeed).toBeNull();
    expect(handle.clear).toHaveBeenCalled();
    expect(handle.focus).toHaveBeenCalled();
    unmount();
  });
});
