import { describe, expect, it } from 'vitest';
import { DocumentWatches } from '../../../src/core/documents/watches';
import type { DocumentRecord } from '../../../src/shared/documents';
import { FakeFileWatcher } from '../../helpers/fakes';

function setup() {
  const watcher = new FakeFileWatcher();
  const heard: [number, string][] = [];
  const watches = new DocumentWatches({ watcher, changed: (window, id) => heard.push([window, id]) });
  return { watcher, heard, watches };
}

const tab = (id: string, path: string): DocumentRecord => ({ id, path });

describe('DocumentWatches', () => {
  it("tells which window's tab changed when its file does", () => {
    const { watcher, heard, watches } = setup();
    watches.sync(1, [tab('a', '/d/a.md'), tab('b', '/d/b.md')]);
    watcher.emit({ path: '/d/b.md', kind: 'change' });
    expect(heard).toEqual([[1, 'b']]);
  });

  it('follows a tab to the file it navigated to', () => {
    const { watcher, heard, watches } = setup();
    watches.sync(1, [tab('a', '/d/a.md')]);
    watches.sync(1, [tab('a', '/d/next.md')]);
    watcher.emit({ path: '/d/a.md', kind: 'change' });
    watcher.emit({ path: '/d/next.md', kind: 'change' });
    expect(heard).toEqual([[1, 'a']]);
  });

  it('stops watching closed tabs and closed windows, leaving other windows alone', () => {
    const { watcher, heard, watches } = setup();
    watches.sync(1, [tab('a', '/d/a.md'), tab('b', '/d/b.md')]);
    watches.sync(2, [tab('c', '/d/a.md')]);
    watches.sync(1, [tab('b', '/d/b.md')]);
    watcher.emit({ path: '/d/a.md', kind: 'change' });
    expect(heard).toEqual([[2, 'c']]);
    watches.sync(2, []);
    watcher.emit({ path: '/d/a.md', kind: 'change' });
    watcher.emit({ path: '/d/b.md', kind: 'delete' });
    expect(heard).toEqual([
      [2, 'c'],
      [1, 'b'],
    ]);
  });

  it("never watches a settings tab, which has no file", () => {
    const { watcher, heard, watches } = setup();
    watches.sync(1, [{ id: 's', path: '', kind: 'settings' }]);
    watcher.emit({ path: '', kind: 'change' });
    expect(heard).toEqual([]);
  });

  it('keeps going when a file cannot be watched', () => {
    const heard: string[] = [];
    const watches = new DocumentWatches({
      watcher: {
        watch: (path) => {
          if (path === '/gone/a.md') throw new Error('no folder');
          return () => {};
        },
      },
      changed: (_window, id) => heard.push(id),
    });
    expect(() => watches.sync(1, [tab('a', '/gone/a.md'), tab('b', '/d/b.md')])).not.toThrow();
  });

  it.each([
    ['the window it left first', [1, 2]],
    ['the window it reached first', [2, 1]],
  ] as const)('follows a tab moved to another window, whichever window syncs first: %s', (_order, windows) => {
    const { watcher, heard, watches } = setup();
    watches.sync(1, [tab('a', '/d/a.md'), tab('b', '/d/b.md')]);
    const now: Record<number, DocumentRecord[]> = { 1: [tab('b', '/d/b.md')], 2: [tab('a', '/d/a.md')] };
    for (const window of windows) watches.sync(window, now[window]!);
    watcher.emit({ path: '/d/a.md', kind: 'change' });
    expect(heard).toEqual([[2, 'a']]);
  });
});
