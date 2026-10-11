import { describe, expect, it } from 'vitest';
import { TabRegistry } from '../tabs/registry';
import { openFiles } from './open-files';

function registry() {
  let n = 0;
  return new TabRegistry(() => `t${++n}`);
}

describe('openFiles', () => {
  it('opens each file as a tab, in order, and shows the first one', () => {
    const tabs = registry();
    tabs.activate(tabs.open('/d/x.md', 1).id, 1);
    openFiles(tabs, 1, ['/d/a.md', '/d/b.md']);
    const snapshot = tabs.snapshot(1);
    expect(snapshot.tabs.map((tab) => tab.path)).toEqual(['/d/x.md', '/d/a.md', '/d/b.md']);
    expect(snapshot.active).toBe(snapshot.tabs[1]!.id);
  });

  it('shows a file the window already has instead of opening it again', () => {
    const tabs = registry();
    const a = tabs.open('/d/a.md', 1);
    tabs.open('/d/b.md', 1);
    openFiles(tabs, 1, ['/d/a.md']);
    expect(tabs.list(1)).toHaveLength(2);
    expect(tabs.snapshot(1).active).toBe(a.id);
  });

  it('opens the same file once even when a request names it twice', () => {
    const tabs = registry();
    openFiles(tabs, 1, ['/d/a.md', '/d/a.md']);
    expect(tabs.list(1)).toHaveLength(1);
  });

  it('only looks in the target window', () => {
    const tabs = registry();
    tabs.open('/d/a.md', 2);
    openFiles(tabs, 1, ['/d/a.md']);
    expect(tabs.list(1)).toHaveLength(1);
    expect(tabs.list(2)).toHaveLength(1);
  });

  it('changes nothing without files', () => {
    const tabs = registry();
    const a = tabs.open('/d/a.md', 1);
    tabs.open('/d/b.md', 1);
    tabs.activate(a.id, 1);
    const revision = tabs.snapshot(1).revision;
    openFiles(tabs, 1, []);
    expect(tabs.snapshot(1).revision).toBe(revision);
  });

  it('never shows another of the new tabs on the way, so the window renders only the first', () => {
    let n = 0;
    const shown: (string | null)[] = [];
    const tabs: TabRegistry = new TabRegistry(
      () => `t${++n}`,
      (window) => shown.push(tabs.snapshot(window).active),
    );
    openFiles(tabs, 1, ['/d/a.md', '/d/b.md', '/d/c.md']);
    expect(new Set(shown)).toEqual(new Set([null, 't1']));
  });

  it('starts where asked: after a given tab, or before every tab', () => {
    const tabs = registry();
    const x = tabs.open('/d/x.md', 1);
    const y = tabs.open('/d/y.md', 1);
    tabs.activate(y.id, 1);
    openFiles(tabs, 1, ['/d/a.md', '/d/b.md'], x.id);
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/x.md', '/d/a.md', '/d/b.md', '/d/y.md']);
    openFiles(tabs, 1, ['/d/c.md', '/d/d.md'], null);
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/c.md', '/d/d.md', '/d/x.md', '/d/a.md', '/d/b.md', '/d/y.md']);
    expect(tabs.snapshot(1).active).toBe(tabs.list(1)[0]!.id);
  });

  it("marks each file, new or already open, as the reader's choice when asked", () => {
    const tabs = registry();
    const a = tabs.open('/d/a.md', 1);
    const c = tabs.open('/d/c.md', 1);
    openFiles(tabs, 1, ['/d/a.md', '/d/b.md'], undefined, { chosen: true });
    const b = tabs.find('/d/b.md', 1)!;
    expect([tabs.chosen(a.id, 1), tabs.chosen(b.id, 1), tabs.chosen(c.id, 1)]).toEqual([true, true, false]);
    openFiles(tabs, 1, ['/d/c.md']);
    expect(tabs.chosen(c.id, 1)).toBe(false);
  });
});
