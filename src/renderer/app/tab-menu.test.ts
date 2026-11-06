import { describe, expect, it, vi } from 'vitest';
import type { TabStore } from '../tabs/store';
import { runTabMenuChoice } from './tab-menu';

function setup() {
  const store = {
    getSnapshot: () => ({ tabs: [{ id: 'a', path: '/d/a.md' }, { id: 'b', path: '/d/b.md', pinned: true }] }),
    close: vi.fn(),
    reopenClosed: vi.fn(),
    pin: vi.fn(),
    activate: vi.fn(),
  } as unknown as TabStore;
  const chooseWindow = vi.fn();
  return { store, chooseWindow, deps: { store, say: vi.fn(), chooseWindow } };
}

describe('runTabMenuChoice', () => {
  it('closes, reopens and pins or unpins the right-clicked tab', () => {
    const { store, deps } = setup();
    runTabMenuChoice('close', 'a', deps);
    runTabMenuChoice('reopen', 'a', deps);
    runTabMenuChoice('pin', 'a', deps);
    runTabMenuChoice('pin', 'b', deps);
    expect(store.close).toHaveBeenCalledWith('a');
    expect(store.reopenClosed).toHaveBeenCalledOnce();
    expect(vi.mocked(store.pin).mock.calls).toEqual([['a', true], ['b', false]]);
  });

  it('shows the tab before asking which window it goes to', () => {
    const { store, chooseWindow, deps } = setup();
    runTabMenuChoice('move-to', 'b', deps);
    expect(store.activate).toHaveBeenCalledWith('b');
    expect(chooseWindow).toHaveBeenCalledOnce();
  });

  it('does nothing for a dismissed menu or a tab that has gone', () => {
    const { store, chooseWindow, deps } = setup();
    runTabMenuChoice(null, 'a', deps);
    runTabMenuChoice('close', 'gone', deps);
    expect(store.close).not.toHaveBeenCalled();
    expect(chooseWindow).not.toHaveBeenCalled();
  });
});
