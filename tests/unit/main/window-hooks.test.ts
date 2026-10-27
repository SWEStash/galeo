import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { WindowState } from '../../../src/core/tabs/registry';
import { countInput, followBounds, guardClose, recoverOnCrash, trackFocus, type HookedWindow } from '../../../src/main/window/hooks';

/** A window whose events the test fires, with the calls the hooks make on it. */
function fakeWindow(id = 1) {
  const calls: string[] = [];
  let destroyed = false;
  const window = Object.assign(new EventEmitter(), {
    webContents: Object.assign(new EventEmitter(), { id }),
    flashFrame: (flag: boolean) => void calls.push(`flash ${flag}`),
    close: () => void calls.push('close'),
    isDestroyed: () => destroyed,
  });
  return {
    window: window as unknown as HookedWindow,
    calls,
    destroy: () => (destroyed = true),
    /** Fires `close` and says whether a hook kept the window open. */
    close: () => {
      let kept = false;
      window.emit('close', { preventDefault: () => (kept = true) });
      return kept;
    },
    input: (type: string) => window.webContents.emit('input-event', {}, { type }),
    gone: (reason: string) => window.webContents.emit('render-process-gone', {}, { reason }),
    emit: (event: string) => window.emit(event),
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('followBounds', () => {
  it('tells the session the window moved or resized', () => {
    const fake = fakeWindow();
    const changed = vi.fn();
    followBounds(fake.window, changed);
    fake.emit('move');
    fake.emit('resize');
    expect(changed).toHaveBeenCalledTimes(2);
  });
});

describe('trackFocus', () => {
  function setup() {
    const fake = fakeWindow(4);
    const front = vi.fn();
    const focused = vi.fn();
    const stale = vi.fn();
    const paths: Record<string, string> = { a: '/d/a.md', b: '/d/b.md' };
    trackFocus(fake.window, {
      order: { front },
      focused,
      warm: { warm: () => ['a', 'b', 'gone'] },
      tabs: { get: (id) => (paths[id] ? ({ id, path: paths[id] } as never) : undefined) },
      reads: { changed: async (id) => id === 'b' },
      stale,
    });
    return { fake, front, focused, stale };
  }

  it('stops asking for attention, comes to the front and tells its profile', () => {
    const { fake, front, focused } = setup();
    fake.emit('focus');
    expect(fake.calls).toEqual(['flash false']);
    expect(front).toHaveBeenCalledWith(4);
    expect(focused).toHaveBeenCalledOnce();
  });

  it('marks the warm tabs whose file changed meanwhile stale', async () => {
    const { fake, stale } = setup();
    fake.emit('focus');
    await settled();
    expect(stale.mock.calls).toEqual([['b']]);
  });
});

describe('guardClose', () => {
  function setup({ dirty = [] as string[], windows = 2, quitting = false, discard = false, emptied = false, tabs = 1, answer = true } = {}) {
    const fake = fakeWindow(3);
    const holdForQuit = vi.fn();
    const keepClosed = vi.fn();
    const confirm = vi.fn(async () => answer);
    const state = { tabs: Array.from({ length: tabs }, () => ({})) } as unknown as WindowState;
    guardClose(fake.window, {
      quitting: () => quitting,
      profile: { discard, windows: Array.from({ length: windows }), keeper: { holdForQuit }, keepClosed },
      dirty: () => dirty,
      confirm,
      emptiedByMove: () => emptied,
      tabs: { exportWindow: () => state, stamp: () => 42 },
      bounds: () => ({ x: 1, y: 2, width: 3, height: 4, maximized: false }),
    });
    return { fake, holdForQuit, keepClosed, confirm, state };
  }

  it('keeps a window with unsaved changes open and asks; closes it once the reader agrees, without asking again', async () => {
    const { fake, confirm, keepClosed } = setup({ dirty: ['a'] });
    expect(fake.close()).toBe(true);
    expect(confirm).toHaveBeenCalledWith([3]);
    await settled();
    expect(fake.calls).toEqual(['close']);
    expect(fake.close()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(keepClosed).toHaveBeenCalledOnce();
  });

  it("stays open when the reader cancels, or when the window went while they were asked", async () => {
    const cancelled = setup({ dirty: ['a'], answer: false });
    cancelled.fake.close();
    await settled();
    expect(cancelled.fake.calls).toEqual([]);
    const gone = setup({ dirty: ['a'] });
    gone.fake.close();
    gone.fake.destroy();
    await settled();
    expect(gone.fake.calls).toEqual([]);
  });

  it("doesn't ask or keep anything while quitting or for a discarded profile", () => {
    for (const options of [{ quitting: true }, { discard: true }]) {
      const { fake, confirm, keepClosed, holdForQuit } = setup({ dirty: ['a'], ...options });
      expect(fake.close()).toBe(false);
      expect(confirm).not.toHaveBeenCalled();
      expect(keepClosed).not.toHaveBeenCalled();
      expect(holdForQuit).not.toHaveBeenCalled();
    }
  });

  it("holds the profile's save on its last window, without the window when its last tab moved away", () => {
    const last = setup({ windows: 1 });
    last.fake.close();
    expect(last.holdForQuit).toHaveBeenCalledWith({});
    const emptied = setup({ windows: 1, emptied: true });
    emptied.fake.close();
    expect(emptied.holdForQuit).toHaveBeenCalledWith({ without: 3 });
    expect(last.keepClosed).not.toHaveBeenCalled();
  });

  it('keeps the tabs of one of several windows to reopen, unless it had none', () => {
    const { fake, keepClosed, state } = setup();
    fake.close();
    expect(keepClosed).toHaveBeenCalledWith({ state, bounds: { x: 1, y: 2, width: 3, height: 4, maximized: false }, at: 42 });
    const empty = setup({ tabs: 0 });
    empty.fake.close();
    expect(empty.keepClosed).not.toHaveBeenCalled();
  });
});

describe('countInput', () => {
  it('credits real input and follows the mouse button', () => {
    const fake = fakeWindow(2);
    const input = { received: vi.fn(), pressed: vi.fn(), released: vi.fn() };
    countInput(fake.window, input);
    fake.input('keyDown');
    fake.input('mouseDown');
    fake.input('mouseUp');
    fake.input('mouseMove');
    expect(input.received.mock.calls).toEqual([[2], [2]]);
    expect(input.pressed.mock.calls).toEqual([[2]]);
    expect(input.released.mock.calls).toEqual([[2]]);
  });
});

describe('recoverOnCrash', () => {
  it('recovers a renderer that went away, but not one that exited cleanly, while quitting, or with the window gone', () => {
    let quitting = false;
    const fake = fakeWindow();
    const recover = vi.fn();
    recoverOnCrash(fake.window, { quitting: () => quitting, recover });
    fake.gone('clean-exit');
    fake.gone('crashed');
    quitting = true;
    fake.gone('oom');
    quitting = false;
    fake.destroy();
    fake.gone('killed');
    expect(recover.mock.calls).toEqual([[fake.window, 'crashed']]);
  });
});
