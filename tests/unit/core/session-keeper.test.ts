import { describe, expect, it } from 'vitest';
import { SessionKeeper } from '../../../src/core/session/keeper';
import type { SessionFile } from '../../../src/core/session/model';
import { TabRegistry } from '../../../src/core/tabs/registry';
import { FakeClock } from '../../helpers/fakes';

function setup() {
  const clock = new FakeClock(1_000);
  let n = 0;
  const tabs = new TabRegistry(() => `id-${++n}`);
  const saved: SessionFile[] = [];
  const windows = [
    { id: 1, bounds: { x: 0, y: 0, width: 800, height: 600, maximized: false } },
    { id: 2, bounds: null },
  ];
  let focused = [2, 1];
  const keeper = new SessionKeeper({
    tabs,
    clock,
    save: async (session) => void saved.push(session),
    windows: () => windows,
    focusOrder: () => focused,
  });
  return { clock, tabs, saved, keeper, windows, setFocus: (order: number[]) => (focused = order) };
}

describe('SessionKeeper (ADR-005)', () => {
  it("captures every window's bounds and tabs, and the focus order as window indices", () => {
    const { tabs, keeper } = setup();
    tabs.open('/d/a.md', 1);
    tabs.open('/d/b.md', 2);
    expect(keeper.capture()).toEqual({
      savedAt: 1_000,
      focusOrder: [1, 0],
      windows: [
        { bounds: { x: 0, y: 0, width: 800, height: 600, maximized: false }, active: null, tabs: [{ entries: [{ path: '/d/a.md', anchor: null }], index: 0 }] },
        { bounds: null, active: null, tabs: [{ entries: [{ path: '/d/b.md', anchor: null }], index: 0 }] },
      ],
    });
  });

  it('saves 2 s after a change', () => {
    const { clock, tabs, saved, keeper } = setup();
    tabs.open('/d/a.md', 1);
    keeper.changed();
    clock.advance(2_000);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.windows[0]!.tabs).toHaveLength(1);
  });

  it('keeps the session as it was when the last window started closing, for the save on quit', async () => {
    const { tabs, saved, keeper, windows } = setup();
    tabs.open('/d/a.md', 1);
    windows.splice(1);
    keeper.holdForQuit();
    tabs.closeWindow(1);
    windows.splice(0);
    keeper.changed();
    await keeper.flushOnQuit();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.windows[0]!.tabs[0]!.entries[0]!.path).toBe('/d/a.md');
  });

  it('saves the current session on quit when no window was closing', async () => {
    const { tabs, saved, keeper } = setup();
    tabs.open('/d/a.md', 2);
    await keeper.flushOnQuit();
    expect(saved[0]!.windows[1]!.tabs).toHaveLength(1);
  });

  it('saves nothing until a session is running: a quit before any window keeps the last one', async () => {
    const clock = new FakeClock();
    const saved: SessionFile[] = [];
    const keeper = new SessionKeeper({
      tabs: new TabRegistry(() => 'x'),
      clock,
      save: async (session) => void saved.push(session),
      windows: () => [],
      focusOrder: () => [],
      running: false,
    });
    keeper.changed();
    clock.advance(20_000);
    await keeper.flushOnQuit();
    expect(saved).toEqual([]);
    keeper.start();
    await keeper.flushOnQuit();
    expect(saved).toHaveLength(1);
  });

  it('keeps saving after the last window closed and another opened (macOS keeps running)', () => {
    const { clock, tabs, saved, keeper } = setup();
    keeper.holdForQuit();
    keeper.resume();
    tabs.open('/d/a.md', 1);
    keeper.changed();
    clock.advance(2_000);
    expect(saved).toHaveLength(1);
  });
});
