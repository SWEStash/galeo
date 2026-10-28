import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useLoaded } from './useLoaded';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => ((resolve = yes), (reject = no)));
  return { promise, resolve, reject };
}

async function mount<T>(load: () => Promise<T>, initial: T, onFailed?: (error: unknown) => T) {
  let seen!: ReturnType<typeof useLoaded<T>>;
  function Probe() {
    seen = useLoaded(load, initial, onFailed);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
  return { get: () => seen, unmount: () => act(() => root.unmount()) };
}

describe('useLoaded', () => {
  it('shows the initial value, then what loaded, and can still be set', async () => {
    const load = deferred<string[]>();
    const { get, unmount } = await mount(() => load.promise, []);
    expect(get()[0]).toEqual([]);
    await act(async () => load.resolve(['a']));
    expect(get()[0]).toEqual(['a']);
    await act(async () => get()[1]([]));
    expect(get()[0]).toEqual([]);
    unmount();
  });

  it('shows what onFailed gives when loading fails', async () => {
    const load = deferred<string[] | null>();
    const { get, unmount } = await mount(() => load.promise, null, () => []);
    await act(async () => load.reject(new Error('gone')));
    expect(get()[0]).toEqual([]);
    unmount();
  });

  it('drops a result that arrives after it was unmounted', async () => {
    const load = deferred<string>();
    const { get, unmount } = await mount(() => load.promise, 'first');
    unmount();
    await act(async () => load.resolve('late'));
    expect(get()[0]).toBe('first');
  });
});
