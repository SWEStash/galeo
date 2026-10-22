import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '../../shared/tabs';
import { CommandsProvider } from '../commands/useCommands';
import type { TabStatus, TabsView } from './store';
import { TabOverview, type OverviewStore } from './TabOverview';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

const TABS: TabView[] = [
  { id: 'a', path: '/home/me/a.md', format: 'markdown', folder: '~' },
  { id: 'b', path: '/home/me/docs/plan.md', format: 'markdown', folder: '~/docs' },
  { id: 'c', path: '/srv/app.log', format: 'log', folder: '/srv' },
];

/** A store whose view tests change by hand, as main's snapshots would. */
function fakeStore(active = 'b', dirty: string[] = []) {
  let view: TabsView = {
    revision: 1,
    tabs: TABS,
    active,
    rendered: new Set([active]),
    reads: new Map(),
    statuses: new Map(dirty.map((id) => [id, { dirty: true, editing: true } as TabStatus])),
    zooms: new Map(),
    widths: new Map(),
    reloaded: new Set(),
    crashed: new Set(),
    dragging: false,
  };
  const listeners = new Set<() => void>();
  const store = {
    subscribe: (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener)),
    getSnapshot: () => view,
    activate: vi.fn(),
    close: vi.fn(),
    move: vi.fn(),
  } satisfies OverviewStore;
  const change = (next: Partial<TabsView>) =>
    act(() => {
      view = { ...view, ...next };
      for (const listener of listeners) listener();
    });
  return { store, change };
}

async function shown(store: OverviewStore) {
  const onClose = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <CommandsProvider platform="linux">
        <TabOverview store={store} onClose={onClose} />
      </CommandsProvider>,
    ),
  );
  await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  return { onClose };
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-testid="overview-card"]')];
const focused = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-testid="overview-card"]')?.dataset['cardId'];

/** A key press, down and up, as react-aria acts on some keys when they're released. */
const press = async (key: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })));
  await act(async () => target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init })));
};

describe('TabOverview', () => {
  it("shows a card per tab, in tab order, each named with its indicators and position, the shown tab's card focused", async () => {
    const { store } = fakeStore('b', ['b']);
    await shown(store);
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Tab overview');
    expect(document.querySelector('[role="grid"]')).not.toBeNull();
    expect(cards().map((card) => card.dataset['cardId'])).toEqual(['a', 'b', 'c']);
    const plan = cards()[1]!;
    expect(plan.textContent).toContain('plan.md');
    expect(plan.textContent).toContain('~/docs');
    expect(plan.textContent).toContain('unsaved changes');
    expect(plan.textContent).toContain('2 of 3');
    expect(plan.dataset['active']).toBe('true');
    expect(focused()).toBe('b');
  });

  it('shows the tab of the card chosen with Enter, and closes', async () => {
    const { store } = fakeStore();
    const { onClose } = await shown(store);
    await press('ArrowRight');
    expect(focused()).toBe('c');
    await press('Enter');
    expect(store.activate).toHaveBeenCalledWith('c');
    expect(onClose).toHaveBeenCalled();
  });

  it("closes the focused card's tab on Delete and Ctrl+W, and focuses the card now in its place", async () => {
    const { store, change } = fakeStore();
    await shown(store);
    await press('Delete');
    expect(store.close).toHaveBeenCalledWith('b');
    change({ tabs: TABS.filter((tab) => tab.id !== 'b'), active: 'c' });
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(focused()).toBe('c');
    await press('w', { ctrlKey: true });
    expect(store.close).toHaveBeenLastCalledWith('c');
  });

  it('moves the focused card, not the shown tab, with Ctrl+Shift+PgUp and PgDn', async () => {
    const { store } = fakeStore('b');
    await shown(store);
    await press('Home');
    expect(focused()).toBe('a');
    await press('PageDown', { ctrlKey: true, shiftKey: true });
    expect(store.move).toHaveBeenCalledWith('a', 1);
    expect(focused()).toBe('a');
    await press('PageUp', { ctrlKey: true, shiftKey: true });
    expect(store.move).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and when the last tab is gone', async () => {
    const first = fakeStore();
    const { onClose } = await shown(first.store);
    await press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
    const second = fakeStore();
    const again = await shown(second.store);
    second.change({ tabs: [], active: null });
    expect(again.onClose).toHaveBeenCalled();
  });
});
