import { describe, expect, it } from 'vitest';
import type { SessionFile } from '../../../src/core/session/model';
import type { WindowState } from '../../../src/core/tabs/registry';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { sessionHandlers } from '../../../src/main/session/session-handlers';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;
const state = (path: string) => ({ tabs: [{ path }], active: 0 }) as unknown as WindowState;

function setup({ tabsInWindow = 0, ready = true } = {}) {
  const session = {
    windows: [
      { bounds: null, ...state('/a.md') },
      { bounds: { x: 1, y: 2, width: 3, height: 4 }, ...state('/b.md') },
    ],
  } as unknown as SessionFile;
  let release: () => void = () => {};
  let hold = false;
  const profile = {
    sessions: {
      previous: async () => [{ snapshot: 1, savedAt: 5, windows: 2, tabs: 2 }],
      readPrevious: async (snapshot: number) => {
        if (hold) await new Promise<void>((resolve) => (release = resolve));
        return snapshot === 1 ? session : null;
      },
    },
  };
  const restored: [number, unknown][] = [];
  const opened: unknown[] = [];
  const handlers = sessionHandlers({
    profileOf: (window) => (window === 1 ? profile : undefined),
    ready: () => ready,
    tabs: {
      list: () => Array.from({ length: tabsInWindow }) as never[],
      restoreWindow: (window, windowState) => (restored.push([window, windowState]), []),
    },
    openWindow: (_profile, window) => void opened.push(window),
  });
  return { handlers, restored, opened, holdReads: () => (hold = true), release: () => release() };
}

describe('sessionHandlers', () => {
  it("lists the sender profile's earlier sessions, none for a window with no profile", async () => {
    const { handlers } = setup();
    expect(await handlers['session.previous']([], from(1))).toHaveLength(1);
    expect(await handlers['session.previous']([], from(9))).toEqual([]);
  });

  it('puts the first window into the empty asking window and opens the others', async () => {
    const { handlers, restored, opened } = setup();
    await handlers['session.restorePrevious']([1], from(1));
    expect(restored).toEqual([[1, expect.objectContaining({ tabs: [{ path: '/a.md' }] })]]);
    expect(opened).toEqual([{ bounds: { x: 1, y: 2, width: 3, height: 4 }, state: expect.objectContaining({ tabs: [{ path: '/b.md' }] }) }]);
  });

  it('opens every window new when the asking window has tabs', async () => {
    const { handlers, restored, opened } = setup({ tabsInWindow: 2 });
    await handlers['session.restorePrevious']([1], from(1));
    expect(restored).toEqual([]);
    expect(opened).toHaveLength(2);
  });

  it('refuses an unknown snapshot, a second restore while one runs, and restores before the sandbox choice', async () => {
    const { handlers, holdReads, release } = setup();
    await expect(async () => handlers['session.restorePrevious']([7], from(1))).rejects.toThrow('no such session');
    holdReads();
    const first = handlers['session.restorePrevious']([1], from(1));
    await expect(async () => handlers['session.restorePrevious']([1], from(1))).rejects.toThrow('not now');
    release();
    await first;
    const choosing = setup({ ready: false });
    await expect(async () => choosing.handlers['session.restorePrevious']([1], from(1))).rejects.toThrow('not now');
  });
});
