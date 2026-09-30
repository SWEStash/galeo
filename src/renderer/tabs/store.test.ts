import { describe, expect, it, vi } from 'vitest';
import type { TabSnapshot } from '../../shared/tabs';
import { createTabStore } from './store';

const tab = (id: string) => ({ id, path: `/d/${id}.md` });
const snapshot = (revision: number, ids: string[], active: string | null = null): TabSnapshot => ({
  revision,
  active,
  tabs: ids.map(tab),
});

function setup(initial: TabSnapshot) {
  let push: (snapshot: TabSnapshot) => void = () => {};
  let demote: (ids: string[]) => void = () => {};
  let stale: (id: string) => void = () => {};
  const api = {
    snapshot: vi.fn().mockResolvedValue(initial),
    activated: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    reopenClosed: vi.fn().mockResolvedValue(undefined),
    position: vi.fn().mockResolvedValue(undefined),
    zoom: vi.fn().mockResolvedValue(undefined),
    viewState: vi.fn().mockResolvedValue(undefined),
    onChanged: vi.fn((listener: (snapshot: TabSnapshot) => void) => {
      push = listener;
      return () => {};
    }),
    onDemote: vi.fn((listener: (ids: string[]) => void) => {
      demote = listener;
      return () => {};
    }),
    onStale: vi.fn((listener: (id: string) => void) => {
      stale = listener;
      return () => {};
    }),
  };
  const store = createTabStore(api);
  return { api, store, push: (next: TabSnapshot) => push(next), demote: (ids: string[]) => demote(ids), stale: (id: string) => stale(id) };
}

describe('createTabStore', () => {
  it("starts from main's tabs, activating the one main last heard of", async () => {
    const { store, api } = setup(snapshot(3, ['a', 'b'], 'b'));
    await store.start();
    expect(store.getSnapshot()).toMatchObject({ active: 'b', tabs: [tab('a'), tab('b')] });
    expect(api.activated).not.toHaveBeenCalled();
  });

  it('activates the first tab when main knows of none, and says so', async () => {
    const { store, api } = setup(snapshot(1, ['a', 'b']));
    await store.start();
    expect(store.getSnapshot().active).toBe('a');
    expect(api.activated).toHaveBeenCalledWith('a');
  });

  it('applies newer snapshots only, even when one arrives before the first pull answers', async () => {
    const { store, push, api } = setup(snapshot(2, ['a']));
    api.snapshot.mockImplementationOnce(async () => {
      push(snapshot(4, ['a', 'b'], 'a'));
      return snapshot(2, ['a']);
    });
    await store.start();
    expect(store.getSnapshot().tabs).toEqual([tab('a'), tab('b')]);
    push(snapshot(3, ['x']));
    expect(store.getSnapshot().tabs).toEqual([tab('a'), tab('b')]);
  });

  it('activates a tab at once, then reports it', async () => {
    const { store, api } = setup(snapshot(1, ['a', 'b'], 'a'));
    await store.start();
    const listener = vi.fn();
    store.subscribe(listener);
    store.activate('b');
    expect(store.getSnapshot().active).toBe('b');
    expect(listener).toHaveBeenCalled();
    expect(api.activated).toHaveBeenLastCalledWith('b');
    store.activate('nope');
    expect(store.getSnapshot().active).toBe('b');
  });

  it('shows a tab main showed itself (a launch into this window, the settings tab)', async () => {
    const { store, push } = setup(snapshot(1, ['a'], 'a'));
    await store.start();
    push(snapshot(2, ['a', 'b'], 'b'));
    expect(store.getSnapshot().active).toBe('b');
  });

  it("keeps its own choice while main hasn't heard of it yet", async () => {
    const { store, api, push } = setup(snapshot(1, ['a', 'b'], 'a'));
    await store.start();
    let heard: () => void = () => {};
    api.activated.mockImplementationOnce(() => new Promise<void>((resolve) => (heard = resolve)));
    store.activate('b');
    // A snapshot main sent before it heard of b still says a.
    push(snapshot(2, ['a', 'b', 'c'], 'a'));
    expect(store.getSnapshot().active).toBe('b');
    heard();
    await Promise.resolve();
    push(snapshot(3, ['a', 'b', 'c'], 'c'));
    expect(store.getSnapshot().active).toBe('c');
  });

  it('closing the active tab activates its right neighbour, or the left one at the end', async () => {
    const { store, api, push } = setup(snapshot(1, ['a', 'b', 'c'], 'b'));
    await store.start();
    store.close('b');
    expect(store.getSnapshot().active).toBe('c');
    expect(api.close).toHaveBeenCalledWith('b');
    push(snapshot(2, ['a', 'c'], 'c'));
    store.close('c');
    expect(store.getSnapshot().active).toBe('a');
  });

  it('closing another tab keeps the active one', async () => {
    const { store } = setup(snapshot(1, ['a', 'b'], 'b'));
    await store.start();
    store.close('a');
    expect(store.getSnapshot().active).toBe('b');
  });

  it('follows main when the active tab disappears from a snapshot', async () => {
    const { store, push } = setup(snapshot(1, ['a', 'b', 'c'], 'b'));
    await store.start();
    push(snapshot(2, ['a', 'c'], null));
    expect(store.getSnapshot().active).toBe('c');
    push(snapshot(3, [], null));
    expect(store.getSnapshot().active).toBeNull();
    push(snapshot(4, ['d'], null));
    expect(store.getSnapshot().active).toBe('d');
  });

  it('keeps the same snapshot object until something changes', async () => {
    const { store, push } = setup(snapshot(1, ['a'], 'a'));
    await store.start();
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    push(snapshot(1, ['x']));
    expect(store.getSnapshot()).toBe(first);
  });

  it("asks main to move or reopen tabs, and waits for main's snapshot to show it", async () => {
    const { store, api } = setup(snapshot(1, ['a', 'b'], 'a'));
    await store.start();
    store.move('a', 1);
    store.reopenClosed();
    expect(api.move).toHaveBeenCalledWith('a', 1);
    expect(api.reopenClosed).toHaveBeenCalled();
    expect(store.getSnapshot().tabs.map((each) => each.id)).toEqual(['a', 'b']);
  });

  it('activates a reopened tab, whether its snapshot comes before or after the answer', async () => {
    const { store, api, push } = setup(snapshot(1, ['a'], 'a'));
    await store.start();
    api.reopenClosed.mockResolvedValueOnce('b');
    store.reopenClosed();
    await vi.waitFor(() => expect(api.reopenClosed).toHaveBeenCalled());
    await Promise.resolve();
    push(snapshot(2, ['b', 'a'], 'a'));
    expect(store.getSnapshot().active).toBe('b');

    api.reopenClosed.mockImplementationOnce(async () => {
      push(snapshot(3, ['b', 'c', 'a'], 'b'));
      return 'c';
    });
    store.reopenClosed();
    await vi.waitFor(() => expect(store.getSnapshot().active).toBe('c'));
    expect(api.activated).toHaveBeenLastCalledWith('c');
  });

  it('renders a tab once it is shown, and keeps it rendered until main hibernates it', async () => {
    const { store, push, demote } = setup(snapshot(1, ['a', 'b', 'c'], 'a'));
    await store.start();
    expect(store.getSnapshot().rendered).toEqual(new Set(['a']));
    store.activate('b');
    store.activate('c');
    expect(store.getSnapshot().rendered).toEqual(new Set(['a', 'b', 'c']));
    demote(['a', 'c']);
    expect(store.getSnapshot().rendered).toEqual(new Set(['b', 'c']));
    push(snapshot(2, ['c'], 'c'));
    expect(store.getSnapshot().rendered).toEqual(new Set(['c']));
  });

  it('counts the times main said a tab went stale, so it reads again', async () => {
    const { store, stale } = setup(snapshot(1, ['a', 'b'], 'a'));
    await store.start();
    expect(store.getSnapshot().reads.get('a') ?? 0).toBe(0);
    stale('a');
    stale('a');
    stale('nope');
    expect(store.getSnapshot().reads.get('a')).toBe(2);
    expect(store.getSnapshot().reads.has('nope')).toBe(false);
  });

  it("keeps each tab's last position here, and reports it to main", async () => {
    const { store, api } = setup(snapshot(1, ['a'], 'a'));
    await store.start();
    const where = { line: 7, offset: 2, heading: null, fraction: 0.4 };
    expect(store.positionOf('a')).toBeNull();
    store.moved('a', where);
    expect(store.positionOf('a')).toEqual(where);
    expect(api.position).toHaveBeenCalledWith('a', where);
  });

  it("keeps each tab's status for the tab bar and status bar, dropping closed tabs'", async () => {
    const { store, push } = setup(snapshot(1, ['a', 'b'], 'a'));
    await store.start();
    const status = { state: 'ready' as const, format: 'markdown' as const, view: 'rendered' as const, encoding: 'utf-8' as const, lines: 12, follow: false };
    store.setStatus('a', status);
    expect(store.getSnapshot().statuses.get('a')).toEqual(status);
    const before = store.getSnapshot();
    store.setStatus('a', { ...status });
    expect(store.getSnapshot()).toBe(before);
    push(snapshot(2, ['b'], 'b'));
    expect(store.getSnapshot().statuses.has('a')).toBe(false);
  });

  it('zooms each tab on its own, in steps, at once, and tells main', async () => {
    const { store, api } = setup(snapshot(1, ['a', 'b'], 'a'));
    await store.start();
    store.zoom('a', 'in');
    store.zoom('a', 'in');
    expect(store.getSnapshot().zooms.get('a')).toBe(1.25);
    expect(api.zoom).toHaveBeenLastCalledWith('a', 1.25);
    expect(store.getSnapshot().zooms.get('b') ?? 1).toBe(1);
    store.zoom('a', 'reset');
    expect(store.getSnapshot().zooms.get('a') ?? 1).toBe(1);
  });

  it("takes zoom and last positions from main's snapshots (a restored session)", async () => {
    const where = { line: 4, offset: 0, heading: null, fraction: 0.3 };
    const { store } = setup({ revision: 1, active: 'a', tabs: [{ id: 'a', path: '/d/a.md', zoom: 1.5, position: where }] });
    await store.start();
    expect(store.getSnapshot().zooms.get('a')).toBe(1.5);
    expect(store.positionOf('a')).toEqual(where);
    const here = { ...where, line: 9 };
    store.moved('a', here);
    expect(store.positionOf('a')).toEqual(here);
  });

  it('drops a closed tab at once, so a quick second close closes the next tab, not the same one', async () => {
    const { store, api } = setup(snapshot(1, ['a', 'b', 'c'], 'a'));
    await store.start();
    store.close('a');
    store.close(store.getSnapshot().active!);
    expect(api.close.mock.calls).toEqual([['a'], ['b']]);
    expect(store.getSnapshot()).toMatchObject({ active: 'c', tabs: [tab('c')] });
    store.close('a');
    expect(api.close).toHaveBeenCalledTimes(2);
  });

  it("tells main about a close before the next tab's activation, so no snapshot brings the closed tab back", async () => {
    const { store, api } = setup(snapshot(1, ['a', 'b'], 'a'));
    await store.start();
    const calls: string[] = [];
    api.close.mockImplementation(async (id: string) => void calls.push(`close ${id}`));
    api.activated.mockImplementation(async (id: string) => void calls.push(`activated ${id}`));
    store.close('a');
    expect(calls).toEqual(['close a', 'activated b']);
  });

  it('stops hearing main once stopped', async () => {
    const unsubscribed: string[] = [];
    const { store, api } = setup(snapshot(1, ['a'], 'a'));
    api.onChanged.mockReturnValue(() => unsubscribed.push('changed'));
    api.onDemote.mockReturnValue(() => unsubscribed.push('demote'));
    api.onStale.mockReturnValue(() => unsubscribed.push('stale'));
    await store.start();
    store.stop();
    expect(unsubscribed.sort()).toEqual(['changed', 'demote', 'stale']);
  });

  it('marks a tab reloaded from disk for a second, then clears the mark', async () => {
    vi.useFakeTimers();
    try {
      const { store } = setup(snapshot(1, ['a', 'b'], 'a'));
      await store.start();
      store.reloaded('b');
      expect(store.getSnapshot().reloaded.has('b')).toBe(true);
      vi.advanceTimersByTime(999);
      expect(store.getSnapshot().reloaded.has('b')).toBe(true);
      store.reloaded('b');
      vi.advanceTimersByTime(999);
      expect(store.getSnapshot().reloaded.has('b')).toBe(true);
      vi.advanceTimersByTime(1);
      expect(store.getSnapshot().reloaded.has('b')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts each tab in the view state main kept, and reports the reader's changes once", async () => {
    const initial = snapshot(1, ['a', 'b'], 'a');
    initial.tabs[0] = { ...initial.tabs[0]!, view: 'source', follow: true };
    const { store, api, push } = setup(initial);
    await store.start();
    expect(store.viewStateOf('a')).toEqual({ view: 'source', follow: true });
    expect(store.viewStateOf('b')).toEqual({});
    store.setViewState('a', { view: 'source', follow: true });
    expect(api.viewState).not.toHaveBeenCalled();
    store.setViewState('a', { view: 'source' });
    expect(api.viewState).toHaveBeenCalledWith('a', { view: 'source' });
    expect(store.viewStateOf('a')).toEqual({ view: 'source' });
    // A navigation: main's snapshot names the view state of the entry the tab shows now.
    const next = snapshot(2, ['a', 'b'], 'a');
    next.tabs[0] = { ...next.tabs[0]!, view: 'source', follow: true };
    push(next);
    expect(store.viewStateOf('a')).toEqual({ view: 'source', follow: true });
  });
});
