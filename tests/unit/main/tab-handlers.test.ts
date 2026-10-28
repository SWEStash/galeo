import { describe, expect, it } from 'vitest';
import { ReadIdentities } from '../../../src/core/documents/identities';
import { InputCredits } from '../../../src/core/documents/input-credits';
import { CrashRecovery } from '../../../src/core/tabs/crashes';
import { DRAG_MS, SETTLE_MS, TabDrags } from '../../../src/core/tabs/drags';
import { WarmTabs } from '../../../src/core/tabs/lifecycle';
import { TabRegistry } from '../../../src/core/tabs/registry';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { tabHandlers } from '../../../src/main/tabs/handlers';
import type { TabSnapshot } from '../../../src/shared/tabs';
import { FakeFileSystem } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;
const tabPaths = (snapshot: TabSnapshot) => snapshot.tabs.map((tab) => tab.path);
const MB = 1024 * 1024;

function setup(closedWindows: { at: number | null; reopened: number[] } = { at: null, reopened: [] }) {
  let n = 0;
  const tabs = new TabRegistry(() => `id-${++n}`);
  const fs = new FakeFileSystem({ '/d/a.md': 'a', '/d/b.md': 'b' });
  const reads = new ReadIdentities(fs);
  const resynced: number[] = [];
  const closed: string[] = [];
  const demoted: [number, string[]][] = [];
  const stale: [number, string][] = [];
  const positioned: number[] = [];
  const crashes = new CrashRecovery(() => 0);
  let now = 0;
  const input = new InputCredits(() => now);
  const moved: [string, number, number, number][] = [];
  const tornOff: [string, number][] = [];
  const focused: number[] = [];
  const dragging: boolean[] = [];
  const told: number[] = [];
  const timers: { at: number; run: () => void }[] = [];
  const handlers = tabHandlers({
    crashes,
    positioned: (window) => positioned.push(window),
    tabs,
    warm: new WarmTabs({ count: 1, bytes: 10 * MB }),
    reads,
    resync: (window) => resynced.push(window),
    closed: (id) => closed.push(id),
    demote: (window, ids) => demoted.push([window, ids]),
    stale: (window, id) => stale.push([window, id]),
    closedWindows: { at: () => closedWindows.at, reopen: (window) => closedWindows.reopened.push(window) },
    drags: new TabDrags(),
    now: () => now,
    input,
    move: (id, fromWindow, to, position) => {
      moved.push([id, fromWindow, to, position]);
      return tabs.transfer(id, fromWindow, to, position);
    },
    tearOff: (id, fromWindow) => (tornOff.push([id, fromWindow]), true),
    windows: async (window) => [1, 2].filter((each) => each !== window).map((each) => ({ window: each, profile: 'p', accent: null, shows: null })),
    focus: (window) => focused.push(window),
    dragging: (on) => dragging.push(on),
    tellDragging: (window) => told.push(window),
    after: (ms, run) => void timers.push({ at: now + ms, run }),
    home: '/d',
  });
  const a = tabs.open('/d/a.md', 1).id;
  const b = tabs.open('/d/b.md', 1).id;
  const later = (ms: number) => {
    now += ms;
    for (const timer of timers.filter((each) => each.at <= now)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.run();
    }
  };
  return { tabs, fs, reads, handlers, resynced, closed, demoted, stale, a, b, crashes, positioned: () => positioned, input, moved, tornOff, focused, dragging, told, later, setNow: (at: number) => void (now = at) };
}

describe('tabHandlers', () => {
  it('gives a window its own tabs only', async () => {
    const { handlers, tabs } = setup();
    tabs.open('/d/x.md', 2);
    expect(tabPaths(await handlers['tabs.snapshot']([], from(1)))).toEqual(['/d/a.md', '/d/b.md']);
    expect(await handlers['tabs.snapshot']([], from(3))).toEqual({ revision: 0, active: null, tabs: [] });
  });

  it('opens the Settings tab in the sender window', async () => {
    const { handlers, tabs } = setup();
    const id = await handlers['tabs.openSettings']([], from(1));
    expect(tabs.get(id, 1)?.kind).toBe('settings');
    expect(tabs.get(id, 2)).toBeUndefined();
  });

  it("gives the page each file tab's format and shown folder", async () => {
    const { handlers } = setup();
    const { tabs } = await handlers['tabs.snapshot']([], from(1));
    expect(tabs.map(({ format, folder }) => ({ format, folder }))).toEqual([
      { format: 'markdown', folder: '~' },
      { format: 'markdown', folder: '~' },
    ]);
  });

  it('records activation, closes, reopens and moves tabs of the sending window', async () => {
    const { handlers, tabs, input, a, b } = setup();
    await handlers['tabs.activated']([b], from(1));
    expect(tabs.snapshot(1).active).toBe(b);
    handlers['tabs.move']([b, 0], from(1));
    expect(tabs.list(1).map((tab) => tab.id)).toEqual([b, a]);
    handlers['tabs.close']([a], from(1));
    input.received(1);
    const reopened = handlers['tabs.reopenClosed']([], from(1));
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/b.md', '/d/a.md']);
    expect(reopened).toBe(tabs.list(1)[1]!.id);
    input.received(1);
    expect(handlers['tabs.reopenClosed']([], from(1))).toBeNull();
  });

  it('Ctrl+Shift+T brings back nothing, tab or window, without real input', () => {
    const closedWindows = { at: null as number | null, reopened: [] as number[] };
    const { handlers, tabs, a } = setup(closedWindows);
    handlers['tabs.close']([a], from(1));
    expect(handlers['tabs.reopenClosed']([], from(1))).toBeNull();
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/b.md']);
    closedWindows.at = tabs.stamp();
    expect(handlers['tabs.reopenClosed']([], from(1))).toBeNull();
    expect(closedWindows.reopened).toEqual([]);
  });

  it('Ctrl+Shift+T brings back a window of the profile when it closed after the last closed tab', () => {
    const closedWindows = { at: null as number | null, reopened: [] as number[] };
    const { handlers, tabs, input, a } = setup(closedWindows);
    handlers['tabs.close']([a], from(1));
    closedWindows.at = tabs.stamp();
    input.received(1);
    expect(handlers['tabs.reopenClosed']([], from(1))).toBeNull();
    expect(closedWindows.reopened).toEqual([1]);
    expect(tabs.list(1)).toHaveLength(1);
  });

  it('Ctrl+Shift+T brings back a tab that closed after the last closed window', () => {
    const closedWindows = { at: null as number | null, reopened: [] as number[] };
    const { handlers, tabs, input, a } = setup(closedWindows);
    closedWindows.at = tabs.stamp();
    handlers['tabs.close']([a], from(1));
    input.received(1);
    expect(handlers['tabs.reopenClosed']([], from(1))).toBe(tabs.list(1)[0]!.id);
    expect(closedWindows.reopened).toEqual([]);
  });

  it('Ctrl+Shift+T brings back a closed window when the window closed no tab', () => {
    const closedWindows = { at: 1, reopened: [] as number[] };
    const { handlers, input } = setup(closedWindows);
    input.received(1);
    expect(handlers['tabs.reopenClosed']([], from(1))).toBeNull();
    expect(closedWindows.reopened).toEqual([1]);
  });

  describe('tab search (UX F16)', () => {
    it("finds the window's own open tabs, not the settings tab, and its closed ones", async () => {
      const { handlers, tabs, a, b } = setup();
      tabs.open('/d/x.md', 2);
      tabs.openSettings(1);
      const c = tabs.open('/d/c.md', 1).id;
      handlers['tabs.close']([c], from(1));
      expect(await handlers['tabs.search']([''], from(1))).toEqual({
        query: '',
        open: [
          { id: a, name: 'a.md', detail: '~' },
          { id: b, name: 'b.md', detail: '~' },
        ],
        closed: [{ id: c, name: 'c.md', detail: '~' }],
      });
      expect((await handlers['tabs.search'](['b.md'], from(1))).open.map((hit) => hit.id)).toEqual([b]);
      expect(await handlers['tabs.search']([''], from(3))).toEqual({ query: '', open: [], closed: [] });
    });

    it('reopens a closed tab of the window by its id, on real input only', async () => {
      const { handlers, tabs, input, a } = setup();
      handlers['tabs.close']([a], from(1));
      expect(await handlers['tabs.reopenClosedTab']([a], from(1))).toBeNull();
      input.received(1);
      const reopened = await handlers['tabs.reopenClosedTab']([a], from(1));
      expect(reopened).toBeTruthy();
      expect(tabs.get(reopened!, 1)?.path).toBe('/d/a.md');
      expect(tabs.closedList(1)).toEqual([]);
    });

    it("never reopens another window's closed tab, nor a closed window", async () => {
      const closedWindows = { at: 99, reopened: [] as number[] };
      const { handlers, tabs, input, a } = setup(closedWindows);
      const x = tabs.open('/d/x.md', 2).id;
      handlers['tabs.close']([x], from(2));
      input.received(1);
      expect(await handlers['tabs.reopenClosedTab']([x], from(1))).toBeNull();
      input.received(1);
      expect(await handlers['tabs.reopenClosedTab']([a], from(1))).toBeNull();
      expect(closedWindows.reopened).toEqual([]);
      expect(tabs.closedList(2)).toEqual([{ id: x, path: '/d/x.md' }]);
    });
  });

  it('lets go of what main kept for a closed tab', () => {
    const { handlers, closed, a } = setup();
    handlers['tabs.close']([a], from(2));
    expect(closed).toEqual([]);
    handlers['tabs.close']([a], from(1));
    expect(closed).toEqual([a]);
  });

  it('tells the window which tabs to hibernate as it shows tabs and reports their weight', async () => {
    const { handlers, demoted, a, b } = setup();
    await handlers['tabs.activated']([a], from(1));
    handlers['tabs.rendered']([a, 2 * MB], from(1));
    await handlers['tabs.activated']([b], from(1));
    expect(demoted).toEqual([]);
    handlers['tabs.rendered']([a, 12 * MB], from(1));
    expect(demoted).toEqual([[1, [a]]]);
  });

  it('says a warm tab is stale when its file changed since the read it shows', async () => {
    const { handlers, fs, reads, stale, a, b } = setup();
    await reads.remember(a, '/d/a.md');
    await handlers['tabs.activated']([a], from(1));
    await handlers['tabs.activated']([b], from(1));
    fs.write('/d/a.md', 'a, edited');
    await handlers['tabs.activated']([a], from(1));
    expect(stale).toEqual([[1, a]]);
  });

  it("keeps a tab's zoom", () => {
    const { handlers, tabs, a } = setup();
    handlers['tabs.zoom']([a, 1.5], from(1));
    expect(tabs.snapshot(1).tabs[0]).toMatchObject({ id: a, zoom: 1.5 });
  });

  it('keeps where the reader is in a tab, for the session too', () => {
    const { handlers, tabs, a, positioned } = setup();
    const where = { line: 3, offset: 0, heading: null, fraction: 0.1 };
    handlers['tabs.position']([a, where], from(1));
    expect(tabs.position(a, 1)).toEqual(where);
    expect(positioned()).toEqual([1]);
    handlers['tabs.position']([a, where], from(2));
    expect(positioned()).toEqual([1]);
  });

  it("re-syncs a window that names a tab it doesn't have, and changes nothing", async () => {
    const { handlers, tabs, resynced, demoted, a } = setup();
    const before = tabs.snapshot(1);
    await handlers['tabs.activated']([a], from(2));
    handlers['tabs.close']([a], from(2));
    handlers['tabs.move']([a, 3], from(2));
    handlers['tabs.rendered']([a, 99 * MB], from(2));
    handlers['tabs.position']([a, { line: 1, offset: 0, heading: null, fraction: 0 }], from(2));
    await handlers['tabs.activated'](['gone'], from(1));
    expect(resynced).toEqual([2, 2, 2, 2, 2, 1]);
    expect(demoted).toEqual([]);
    expect(tabs.snapshot(1)).toEqual(before);
    expect(tabs.position(a, 1)).toBeNull();
  });

  it('keeps the tab a window is rendering until it reports it rendered, for crash recovery', () => {
    const { handlers, crashes, a, b } = setup();
    handlers['tabs.rendering']([a], from(1));
    handlers['tabs.rendered']([b, 100], from(1));
    handlers['tabs.rendering']([b], from(1));
    handlers['tabs.rendered']([b, 100], from(1));
    expect(crashes.crashed(1).tab).toBeNull();
    handlers['tabs.rendering']([a], from(1));
    expect(crashes.crashed(1).tab).toBe(a);
  });

  it("refuses a breadcrumb or a render-again for another window's tab, and sends the snapshot again", () => {
    const { handlers, crashes, tabs, resynced, a } = setup();
    handlers['tabs.rendering']([a], from(2));
    expect(crashes.crashed(2).tab).toBeNull();
    tabs.markCrashed(a, 1);
    handlers['tabs.renderAgain']([a], from(2));
    expect(tabs.snapshot(1).tabs[0]!.crashed).toBe(true);
    expect(resynced).toEqual([2, 2]);
  });

  it('renders a crashed tab again when the reader asks', () => {
    const { handlers, tabs, a } = setup();
    tabs.markCrashed(a, 1);
    handlers['tabs.renderAgain']([a], from(1));
    expect(tabs.snapshot(1).tabs[0]!.crashed).toBeUndefined();
  });

  describe('moving tabs between windows (ADR-019, ADR-022)', () => {
    /** A drag's token, as a page makes it. */
    const k = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

    it('tells a window that opens during a drag that the drag is going on, when it first asks for its tabs', () => {
      const { handlers, input, told, a } = setup();
      handlers['tabs.snapshot']([], from(3));
      expect(told).toEqual([]);
      input.received(1);
      handlers['tabs.dragStart']([a, k(1)], from(1));
      handlers['tabs.snapshot']([], from(3));
      expect(told).toEqual([3]);
    });

    it('tells it nothing once the drag has ended or run out', () => {
      const { handlers, input, told, setNow, a } = setup();
      input.received(1);
      handlers['tabs.dragStart']([a, k(1)], from(1));
      handlers['tabs.adopt']([k(1), 0], from(2));
      handlers['tabs.snapshot']([], from(3));
      input.received(2);
      handlers['tabs.dragStart']([a, k(2)], from(2));
      setNow(DRAG_MS);
      handlers['tabs.snapshot']([], from(3));
      expect(told).toEqual([]);
    });

    it("lets another window take a dragged tab once, by the drag's token, where it was dropped, and says the drag is over", () => {
      const { handlers, input, moved, dragging, a } = setup();
      input.received(1);
      expect(handlers['tabs.dragStart']([a, k(1)], from(1))).toBe(true);
      expect(handlers['tabs.adopt']([k(1), 3], from(2))).toBe(a);
      expect(moved).toEqual([[a, 1, 2, 3]]);
      expect(handlers['tabs.adopt']([k(1), 0], from(2))).toBeNull();
      expect(dragging).toEqual([true, false]);
    });

    it('starts a drag only for a tab of the window, never the settings tab, only on real input, and never with a token used before', () => {
      const { handlers, input, tabs, a } = setup();
      const settings = tabs.openSettings(1).id;
      input.received(1);
      expect(handlers['tabs.dragStart']([a, k(1)], from(2))).toBe(false);
      expect(handlers['tabs.dragStart']([settings, k(2)], from(1))).toBe(false);
      expect(handlers['tabs.dragStart']([a, k(3)], from(1))).toBe(true);
      expect(handlers['tabs.dragStart']([a, k(4)], from(1))).toBe(false);
      input.received(1);
      expect(handlers['tabs.dragStart']([a, k(3)], from(1))).toBe(false);
    });

    it('gives no tab to a window that names the tab, or any token but the live drag\'s', () => {
      const { handlers, input, moved, later, a } = setup();
      expect(handlers['tabs.adopt']([k(1), 0], from(2))).toBeNull();
      input.received(1);
      handlers['tabs.dragStart']([a, k(1)], from(1));
      // A window that once held the tab knows its id: that claims nothing (ADR-022).
      expect(handlers['tabs.adopt']([a, 0], from(2))).toBeNull();
      expect(handlers['tabs.adopt']([k(2), 0], from(2))).toBeNull();
      later(120_000);
      expect(handlers['tabs.adopt']([k(1), 0], from(2))).toBeNull();
      expect(moved).toEqual([]);
    });

    it('moves nothing when the drag is dropped back in its own window (a reorder there)', () => {
      const { handlers, input, moved, a } = setup();
      input.received(1);
      handlers['tabs.dragStart']([a, k(1)], from(1));
      expect(handlers['tabs.adopt']([k(1), 0], from(1))).toBeNull();
      expect(moved).toEqual([]);
    });

    it('ends a drag only for the window that started it, a moment after it says so', () => {
      const { handlers, input, dragging, later, a } = setup();
      input.received(1);
      handlers['tabs.dragStart']([a, k(1)], from(1));
      handlers['tabs.dragEnd']([a, false], from(2));
      handlers['tabs.dragEnd']([a, false], from(1));
      later(SETTLE_MS);
      handlers['tabs.dragEnd']([a, false], from(1));
      later(SETTLE_MS);
      expect(dragging).toEqual([true, false]);
      expect(handlers['tabs.adopt']([k(1), 0], from(2))).toBeNull();
    });

    it('still gives the tab to the window it was dropped on when that window asks after the drag ended', () => {
      const { handlers, input, moved, tornOff, dragging, later, a } = setup();
      for (const [n, outside] of [false, true].entries()) {
        const source = outside ? 2 : 1;
        input.received(source);
        expect(handlers['tabs.dragStart']([a, k(n)], from(source))).toBe(true);
        handlers['tabs.dragEnd']([a, outside], from(source));
        later(SETTLE_MS - 1);
        expect(handlers['tabs.adopt']([k(n), 0], from(outside ? 1 : 2))).toBe(a);
        later(SETTLE_MS);
      }
      expect(moved).toEqual([
        [a, 1, 2, 0],
        [a, 2, 1, 0],
      ]);
      expect(tornOff).toEqual([]);
      expect(dragging).toEqual([true, false, true, false]);
    });

    it("tears off a dragged tab that ended outside the window, whatever took it there, when no galeo window did and the window has another tab", () => {
      const { handlers, input, tornOff, dragging, later, a } = setup();
      input.received(1);
      handlers['tabs.dragStart']([a, k(1)], from(1));
      handlers['tabs.dragEnd']([a, true], from(1));
      later(SETTLE_MS - 1);
      expect(tornOff).toEqual([]);
      later(1);
      expect(tornOff).toEqual([[a, 1]]);
      expect(dragging).toEqual([true, false]);
      expect(handlers['tabs.adopt']([k(1), 0], from(2))).toBeNull();
    });

    it("doesn't tear off a window's only tab, and ends its drag", () => {
      const { handlers, input, tornOff, dragging, later, tabs, a, b } = setup();
      tabs.close(b, 1);
      input.received(1);
      handlers['tabs.dragStart']([a, k(1)], from(1));
      handlers['tabs.dragEnd']([a, true], from(1));
      later(SETTLE_MS);
      expect(tornOff).toEqual([]);
      expect(dragging).toEqual([true, false]);
    });

    it('starts a drag on a mouse press held since long before, once', () => {
      const { handlers, input, later, a } = setup();
      input.pressed(1);
      later(5000);
      expect(handlers['tabs.dragStart']([a, k(1)], from(1))).toBe(true);
      expect(handlers['tabs.dragStart']([a, k(2)], from(1))).toBe(false);
    });

    it('moves a tab to another window from the palette, on real input, and focuses that window', async () => {
      const { handlers, input, moved, focused, tabs, a } = setup();
      tabs.open('/d/x.md', 2);
      expect(await handlers['tabs.moveTo']([a, 2], from(1))).toBe(false);
      input.received(1);
      expect(await handlers['tabs.moveTo']([a, 2], from(1))).toBe(true);
      expect(moved).toEqual([[a, 1, 2, 1]]);
      expect(focused).toEqual([2]);
    });

    it('moves a tab to a new window from the palette, when the window has another tab', async () => {
      const { handlers, input, tornOff, tabs, a, b } = setup();
      input.received(1);
      expect(await handlers['tabs.moveTo']([a, 'new'], from(1))).toBe(true);
      expect(tornOff).toEqual([[a, 1]]);
      tabs.close(b, 1);
      input.received(1);
      expect(await handlers['tabs.moveTo']([a, 'new'], from(1))).toBe(false);
    });

    it('refuses a palette move of a tab the window lacks, the settings tab, or to a window that is not another galeo window', async () => {
      const { handlers, input, moved, tornOff, tabs, a } = setup();
      const settings = tabs.openSettings(1).id;
      for (let i = 0; i < 5; i++) input.received(1);
      expect(await handlers['tabs.moveTo']([a, 2], from(3))).toBe(false);
      expect(await handlers['tabs.moveTo']([settings, 2], from(1))).toBe(false);
      expect(await handlers['tabs.moveTo']([a, 1], from(1))).toBe(false);
      expect(await handlers['tabs.moveTo']([a, 7], from(1))).toBe(false);
      expect(moved).toEqual([]);
      expect(tornOff).toEqual([]);
    });

    it('lists the other windows a tab can move to, on real input only (the list names their files)', async () => {
      const { handlers, input } = setup();
      expect(await handlers['tabs.windows']([], from(1))).toEqual([]);
      input.received(1);
      expect(await handlers['tabs.windows']([], from(1))).toEqual([{ window: 2, profile: 'p', accent: null, shows: null }]);
      expect(await handlers['tabs.windows']([], from(1))).toEqual([]);
    });
  });
});
