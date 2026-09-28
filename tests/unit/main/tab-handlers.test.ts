import { describe, expect, it } from 'vitest';
import { ReadIdentities } from '../../../src/core/documents/identities';
import { WarmTabs } from '../../../src/core/tabs/lifecycle';
import { TabRegistry } from '../../../src/core/tabs/registry';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { tabHandlers } from '../../../src/main/tabs/handlers';
import type { TabSnapshot } from '../../../src/shared/tabs';
import { FakeFileSystem } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;
const tabPaths = (snapshot: TabSnapshot) => snapshot.tabs.map((tab) => tab.path);
const MB = 1024 * 1024;

function setup() {
  let n = 0;
  const tabs = new TabRegistry(() => `id-${++n}`);
  const fs = new FakeFileSystem({ '/d/a.md': 'a', '/d/b.md': 'b' });
  const reads = new ReadIdentities(fs);
  const resynced: number[] = [];
  const closed: string[] = [];
  const demoted: [number, string[]][] = [];
  const stale: [number, string][] = [];
  let positioned = 0;
  const handlers = tabHandlers({
    positioned: () => positioned++,
    tabs,
    warm: new WarmTabs({ count: 1, bytes: 10 * MB }),
    reads,
    resync: (window) => resynced.push(window),
    closed: (id) => closed.push(id),
    demote: (window, ids) => demoted.push([window, ids]),
    stale: (window, id) => stale.push([window, id]),
  });
  const a = tabs.open('/d/a.md', 1).id;
  const b = tabs.open('/d/b.md', 1).id;
  return { tabs, fs, reads, handlers, resynced, closed, demoted, stale, a, b, positioned: () => positioned };
}

describe('tabHandlers', () => {
  it('gives a window its own tabs only', async () => {
    const { handlers, tabs } = setup();
    tabs.open('/d/x.md', 2);
    expect(tabPaths(await handlers['tabs.snapshot']([], from(1)))).toEqual(['/d/a.md', '/d/b.md']);
    expect(await handlers['tabs.snapshot']([], from(3))).toEqual({ revision: 0, active: null, tabs: [] });
  });

  it('records activation, closes, reopens and moves tabs of the sending window', async () => {
    const { handlers, tabs, a, b } = setup();
    await handlers['tabs.activated']([b], from(1));
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
    expect(positioned()).toBe(1);
    handlers['tabs.position']([a, where], from(2));
    expect(positioned()).toBe(1);
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
});
