import { describe, expect, it } from 'vitest';
import { InputCredits } from '../../../src/core/documents/input-credits';
import { SelectionGrants } from '../../../src/core/documents/selections';
import { FolderWatches } from '../../../src/core/watch/watches';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { watchHandlers } from '../../../src/main/watch/handlers';
import type { WatchState } from '../../../src/shared/watch';
import { FakeClock, FakeFileSystem, FakeFileWatcher } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

function setup(answer: string | null = '/home/me/reports') {
  let n = 0;
  const clock = new FakeClock(1_000);
  const fs = new FakeFileSystem({ '/home/me/reports/.keep.md': '', '/home/me/other/x.md': '', '/home/me/a-file.md': '' });
  const watcher = new FakeFileWatcher();
  const tabs = new Map<number, string[]>();
  const sent: [number, WatchState | null][] = [];
  const times: number[] = [];
  const changed: number[] = [];
  const watches = new FolderWatches({
    fs,
    watcher,
    clock,
    grants: new SelectionGrants(() => `id-${++n}`),
    home: '/home/me',
    exclude: () => [],
    tabs: (window) => tabs.get(window) ?? [],
    send: (window, state) => {
      sent.push([window, state]);
      times.push(clock.now());
    },
    changed: (window) => void changed.push(window),
  });
  const input = new InputCredits(() => 0);
  const opened: [number, readonly string[], boolean][] = [];
  const asked: number[] = [];
  const handlers = watchHandlers({
    watches,
    input,
    askFolder: async (window) => {
      asked.push(window);
      return answer;
    },
    open: (window, paths, newWindow) => {
      opened.push([window, paths, newWindow]);
      tabs.set(window, [...(tabs.get(window) ?? []), ...paths]);
      watches.tabsChanged(window);
    },
  });
  /** A file arrives in the watched folder, and the panel's next update goes out. */
  const arrive = async (path: string) => {
    fs.write(path, 'x');
    const slash = path.lastIndexOf('/');
    watcher.emitFolder(path.slice(0, slash), { kind: 'entry', name: path.slice(slash + 1) });
    clock.advance(300);
    await flush();
    clock.advance(300);
  };
  const last = () => sent.at(-1)![1];
  return { handlers, watches, input, opened, asked, sent, times, changed, arrive, last, tabs, watcher, clock, fs };
}

describe('watchHandlers (ADR-034)', () => {
  it('watches the folder main asked for, and shows it from home, its panel open', async () => {
    const { handlers, input, asked, last, changed, watches, clock } = setup();
    input.received(1);
    await handlers['watch.choose']([], from(1));
    expect(asked).toEqual([1]);
    expect(last()).toMatchObject({ status: 'starting', panel: true });
    clock.advance(250);
    expect(last()).toMatchObject({ shown: '~/reports', name: 'reports', status: 'watching', panel: true, entries: [] });
    expect(changed).toContain(1);
    expect(watches.saved(1)).toEqual({ folder: '/home/me/reports', panel: true });
  });

  it('asks for a folder only on real input, and a cancelled dialog changes nothing', async () => {
    const { handlers, asked, sent } = setup(null);
    await expect(handlers['watch.choose']([], from(1))).rejects.toThrow('no input');
    expect(asked).toEqual([]);
    const cancelled = setup(null);
    cancelled.input.received(1);
    await cancelled.handlers['watch.choose']([], from(1));
    expect(cancelled.asked).toEqual([1]);
    expect(sent).toEqual([]);
    expect(cancelled.sent).toEqual([]);
  });

  it('opens an entry by its id, in the window or a new one, and marks it opened', async () => {
    const { handlers, input, opened, arrive, last } = setup();
    input.received(1);
    await handlers['watch.choose']([], from(1));
    await arrive('/home/me/reports/review.md');
    const entry = last()!.entries[0]!;
    expect(entry).toMatchObject({ name: 'review.md', folder: '', kind: 'new', opened: false });
    expect(entry).not.toHaveProperty('path');
    input.received(1);
    await handlers['watch.open']([entry.id, true], from(1));
    expect(opened).toEqual([[1, ['/home/me/reports/review.md'], true]]);
    expect((await handlers['watch.state']([], from(1)))!.entries[0]).toMatchObject({ opened: true });
  });

  it('refuses an open without input, an id never offered, and another window’s id', async () => {
    const { handlers, input, opened, arrive, last } = setup();
    input.received(1);
    await handlers['watch.choose']([], from(1));
    await arrive('/home/me/reports/review.md');
    const { id } = last()!.entries[0]!;
    await expect(handlers['watch.open']([id, false], from(1))).rejects.toThrow('no input');
    input.received(1);
    await expect(handlers['watch.open'](['/home/me/a-file.md', false], from(1))).rejects.toThrow('not offered');
    input.received(2);
    await expect(handlers['watch.open']([id, false], from(2))).rejects.toThrow('not offered');
    expect(opened).toEqual([]);
  });

  it('opens all new entries oldest first, leaving out the opened ones', async () => {
    const { handlers, input, opened, arrive, tabs, watches } = setup();
    input.received(1);
    await handlers['watch.choose']([], from(1));
    await arrive('/home/me/reports/a.md');
    await arrive('/home/me/reports/b.md');
    await arrive('/home/me/reports/c.md');
    tabs.set(1, ['/home/me/reports/b.md']);
    watches.tabsChanged(1);
    input.received(1);
    await handlers['watch.openAllNew']([], from(1));
    expect(opened).toEqual([[1, ['/home/me/reports/a.md', '/home/me/reports/c.md'], false]]);
    input.received(1);
    await handlers['watch.openAllNew']([], from(1));
    expect(opened).toHaveLength(1);
  });

  it('counts an entry for a file already open in a tab as opened when it arrives', async () => {
    const { handlers, input, arrive, last, tabs } = setup();
    tabs.set(1, ['/home/me/reports/live.md']);
    input.received(1);
    await handlers['watch.choose']([], from(1));
    await arrive('/home/me/reports/live.md');
    expect(last()!.entries[0]).toMatchObject({ name: 'live.md', opened: true });
  });

  it('stops: the window hears null, its ids stop counting, the session forgets the folder', async () => {
    const { handlers, input, arrive, last, watches, watcher } = setup();
    input.received(1);
    await handlers['watch.choose']([], from(1));
    await arrive('/home/me/reports/review.md');
    const { id } = last()!.entries[0]!;
    await handlers['watch.stop']([], from(1));
    expect(last()).toBeNull();
    expect(watches.saved(1)).toBeNull();
    expect(watcher.watchedFolders()).toEqual([]);
    input.received(1);
    await expect(handlers['watch.open']([id, false], from(1))).rejects.toThrow('not offered');
  });

  it('keeps the panel state for the session, and one folder per window', async () => {
    const { handlers, input, watches, watcher } = setup();
    input.received(1);
    await handlers['watch.choose']([], from(1));
    handlers['watch.panel']([false], from(1));
    expect(watches.saved(1)).toEqual({ folder: '/home/me/reports', panel: false });
    await watches.start(1, '/home/me/other');
    expect(watcher.watchedFolders()).toEqual(['/home/me/other']);
    watches.closeWindow(1);
    expect(watcher.watchedFolders()).toEqual([]);
  });

  it('restores a saved folder only while it is still a folder (SR-17)', async () => {
    const { watches, watcher } = setup();
    await watches.restore(1, { folder: '/home/me/gone', panel: true });
    await watches.restore(2, { folder: '/home/me/a-file.md', panel: true });
    expect(watches.saved(1)).toBeNull();
    expect(watches.saved(2)).toBeNull();
    await watches.restore(3, { folder: '/home/me/reports', panel: false });
    expect(watches.saved(3)).toEqual({ folder: '/home/me/reports', panel: false });
    expect(watches.state(3)).toMatchObject({ panel: false, entries: [] });
    expect(watcher.watchedFolders()).toEqual(['/home/me/reports']);
  });

  it('sends at most one update per window every 250 ms', async () => {
    const { handlers, input, times, clock, fs, watcher } = setup();
    input.received(1);
    await handlers['watch.choose']([], from(1));
    for (let i = 0; i < 20; i++) {
      fs.write(`/home/me/reports/r${i}.md`, 'x');
      watcher.emitFolder('/home/me/reports', { kind: 'entry', name: `r${i}.md` });
      clock.advance(50);
      await flush();
    }
    clock.advance(1_000);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(250);
    expect(times.length).toBeLessThanOrEqual(1 + Math.ceil(2_000 / 250));
  });
});
