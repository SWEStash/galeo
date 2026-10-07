import { describe, expect, it } from 'vitest';
import { SelectionGrants } from '../../../src/core/documents/selections';
import { openFiles } from '../../../src/core/routing/open-files';
import { RecentFiles } from '../../../src/core/session/recent';
import { TabRegistry } from '../../../src/core/tabs/registry';
import { utf8 } from '../../../src/main/adapters/utf8';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { recentHandlers } from '../../../src/main/session/recent-handlers';
import { FakeFileSystem } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;

async function setup(count = 3, input = true) {
  const fs = new FakeFileSystem();
  let n = 0;
  const recent = new RecentFiles({ fs, utf8, path: '/s/recent.json', parse: (data) => ({ ok: true, value: data as never }), now: () => n++ });
  for (let i = 0; i < count; i++) await recent.add(`/d/f${i}.md`);
  const tabs = new TabRegistry(() => `tab-${++n}`);
  const handlers = recentHandlers({ recent: () => recent, input: { spend: () => input }, selections: new SelectionGrants(() => `pick-${++n}`), open: (window, path) => openFiles(tabs, window, [path]) });
  return { recent, tabs, handlers };
}

describe('recentHandlers', () => {
  it('offers the 8 most recent files, newest first, as opaque ids with their paths to show', async () => {
    const { handlers } = await setup(10);
    const list = await handlers['recent.list']([], from(1));
    expect(list).toHaveLength(8);
    expect(list[0]).toEqual({ id: expect.stringMatching(/^pick-/), path: '/d/f9.md' });
  });

  it('opens a file the window was offered, in that window', async () => {
    const { handlers, tabs } = await setup();
    const [first] = await handlers['recent.list']([], from(1));
    await handlers['recent.open']([first!.id], from(1));
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/f2.md']);
    await handlers['recent.open']([first!.id], from(1));
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/f2.md']);
  });

  it("refuses a path, an id it didn't offer, or another window's", async () => {
    const { handlers, tabs } = await setup();
    const [first] = await handlers['recent.list']([], from(1));
    expect(() => handlers['recent.open'](['/etc/passwd'], from(1))).toThrow();
    expect(() => handlers['recent.open']([first!.id], from(2))).toThrow();
    expect(tabs.list(1)).toEqual([]);
    expect(tabs.list(2)).toEqual([]);
  });

  it('clears the list, and what any window was offered from it', async () => {
    const { handlers, recent } = await setup();
    const [offered] = await handlers['recent.list']([], from(2));
    await handlers['recent.clear']([], from(1));
    expect(() => handlers['recent.open']([offered!.id], from(2))).toThrow();
    expect(recent.list()).toEqual([]);
    expect(await handlers['recent.list']([], from(1))).toEqual([]);
  });

  it("clears only on the reader's input, never on the page's own (T6)", async () => {
    const { handlers, recent } = await setup(3, false);
    await expect(handlers['recent.clear']([], from(1))).rejects.toThrow('no input');
    expect(recent.list()).toHaveLength(3);
  });

  it("uses the list of the sender's profile, and none for a window without one", async () => {
    const fs = new FakeFileSystem();
    let n = 0;
    const listOf = async (name: string) => {
      const list = new RecentFiles({ fs, utf8, path: `/s/${name}.json`, parse: (data) => ({ ok: true, value: data as never }), now: () => n++ });
      await list.add(`/d/${name}.md`);
      return list;
    };
    const [a, b] = [await listOf('a'), await listOf('b')];
    const tabs = new TabRegistry(() => `tab-${++n}`);
    const handlers = recentHandlers({ recent: (window) => ({ 1: a, 2: b })[window], input: { spend: () => true }, selections: new SelectionGrants(() => `pick-${++n}`), open: (window, path) => openFiles(tabs, window, [path]) });
    expect((await handlers['recent.list']([], from(2))).map((file) => file.path)).toEqual(['/d/b.md']);
    await handlers['recent.clear']([], from(1));
    expect(a.list()).toEqual([]);
    expect(b.list()).toHaveLength(1);
    expect(await handlers['recent.list']([], from(3))).toEqual([]);
    await handlers['recent.clear']([], from(3));
  });
});
