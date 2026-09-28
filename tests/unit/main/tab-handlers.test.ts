import { describe, expect, it } from 'vitest';
import { TabRegistry } from '../../../src/core/tabs/registry';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { tabHandlers } from '../../../src/main/tabs/handlers';
import type { TabSnapshot } from '../../../src/shared/tabs';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;
const tabPaths = (snapshot: TabSnapshot) => snapshot.tabs.map((tab) => tab.path);

function setup() {
  let n = 0;
  const tabs = new TabRegistry(() => `id-${++n}`);
  const resynced: number[] = [];
  const closed: string[] = [];
  const handlers = tabHandlers({ tabs, resync: (window) => resynced.push(window), closed: (id) => closed.push(id) });
  const a = tabs.open('/d/a.md', 1).id;
  const b = tabs.open('/d/b.md', 1).id;
  return { tabs, handlers, resynced, closed, a, b };
}

describe('tabHandlers', () => {
  it('gives a window its own tabs only', async () => {
    const { handlers, tabs } = setup();
    tabs.open('/d/x.md', 2);
    expect(tabPaths(await handlers['tabs.snapshot']([], from(1)))).toEqual(['/d/a.md', '/d/b.md']);
    expect(await handlers['tabs.snapshot']([], from(3))).toEqual({ revision: 0, active: null, tabs: [] });
  });

  it('records activation, closes, reopens and moves tabs of the sending window', () => {
    const { handlers, tabs, a, b } = setup();
    handlers['tabs.activated']([b], from(1));
    expect(tabs.snapshot(1).active).toBe(b);
    handlers['tabs.move']([b, 0], from(1));
    expect(tabs.list(1).map((tab) => tab.id)).toEqual([b, a]);
    handlers['tabs.close']([a], from(1));
    const reopened = handlers['tabs.reopenClosed']([], from(1));
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/b.md', '/d/a.md']);
    expect(reopened).toBe(tabs.list(1)[1]!.id);
    expect(handlers['tabs.reopenClosed']([], from(1))).toBeNull();
  });

  it('lets go of what main kept for a closed tab', () => {
    const { handlers, closed, a } = setup();
    handlers['tabs.close']([a], from(2));
    expect(closed).toEqual([]);
    handlers['tabs.close']([a], from(1));
    expect(closed).toEqual([a]);
  });

  it("re-syncs a window that names a tab it doesn't have, and changes nothing", () => {
    const { handlers, tabs, resynced, a } = setup();
    const before = tabs.snapshot(1);
    handlers['tabs.activated']([a], from(2));
    handlers['tabs.close']([a], from(2));
    handlers['tabs.move']([a, 3], from(2));
    handlers['tabs.activated'](['gone'], from(1));
    expect(resynced).toEqual([2, 2, 2, 1]);
    expect(tabs.snapshot(1)).toEqual(before);
  });
});
