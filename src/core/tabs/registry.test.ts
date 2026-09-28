import { describe, expect, it } from 'vitest';
import { TabRegistry } from './registry';

function counterIds() {
  let n = 0;
  return () => `id-${++n}`;
}

describe('TabRegistry', () => {
  it('opens a document in a window under a fresh opaque id', () => {
    const records = new TabRegistry(counterIds());
    expect(records.open('/d/a.md', 1)).toEqual({ id: 'id-1', path: '/d/a.md' });
    expect(records.open('/d/b.md', 1)).toEqual({ id: 'id-2', path: '/d/b.md' });
  });

  it("lists a window's documents in opening order", () => {
    const records = new TabRegistry(counterIds());
    records.open('/d/a.md', 1);
    records.open('/d/x.md', 2);
    records.open('/d/b.md', 1);
    expect(records.list(1).map((record) => record.path)).toEqual(['/d/a.md', '/d/b.md']);
    expect(records.list(3)).toEqual([]);
  });

  it('finds a document only for the window that owns it', () => {
    const records = new TabRegistry(counterIds());
    const { id } = records.open('/d/a.md', 1);
    expect(records.get(id, 1)?.path).toBe('/d/a.md');
    expect(records.get(id, 2)).toBeUndefined();
    expect(records.get('/d/a.md', 1)).toBeUndefined();
    expect(records.get('id-99', 1)).toBeUndefined();
  });

  it('never hands out the same id twice, even if the source repeats', () => {
    const repeats = ['same', 'same', 'other'];
    const records = new TabRegistry(() => repeats.shift()!);
    expect([records.open('/a', 1).id, records.open('/b', 1).id]).toEqual(['same', 'other']);
  });

  it('closes every document of a window', () => {
    const records = new TabRegistry(counterIds());
    const { id } = records.open('/d/a.md', 1);
    records.open('/d/b.md', 2);
    records.closeWindow(1);
    expect(records.get(id, 1)).toBeUndefined();
    expect(records.list(2)).toHaveLength(1);
  });

  it('navigates a document to another file or anchor, with back and forward history', () => {
    const records = new TabRegistry(counterIds());
    const { id } = records.open('/d/a.md', 1);
    records.navigate(id, 1, { path: '/d/a.md', anchor: 'intro' });
    records.navigate(id, 1, { path: '/d/b.md', anchor: null });
    expect(records.get(id, 1)?.path).toBe('/d/b.md');
    expect(records.back(id, 1)).toEqual({ path: '/d/a.md', anchor: 'intro' });
    expect(records.get(id, 1)?.path).toBe('/d/a.md');
    expect(records.back(id, 1)).toEqual({ path: '/d/a.md', anchor: null });
    expect(records.back(id, 1)).toBeNull();
    expect(records.forward(id, 1)).toEqual({ path: '/d/a.md', anchor: 'intro' });
    expect(records.forward(id, 1)).toEqual({ path: '/d/b.md', anchor: null });
    expect(records.forward(id, 1)).toBeNull();
  });

  it('drops the forward history when navigating after going back', () => {
    const records = new TabRegistry(counterIds());
    const { id } = records.open('/d/a.md', 1);
    records.navigate(id, 1, { path: '/d/b.md', anchor: null });
    records.back(id, 1);
    records.navigate(id, 1, { path: '/d/c.md', anchor: null });
    expect(records.forward(id, 1)).toBeNull();
    expect(records.back(id, 1)).toEqual({ path: '/d/a.md', anchor: null });
  });

  it("refuses history moves on another window's document", () => {
    const records = new TabRegistry(counterIds());
    const { id } = records.open('/d/a.md', 1);
    records.navigate(id, 1, { path: '/d/b.md', anchor: null });
    expect(records.back(id, 2)).toBeNull();
    expect(records.navigate(id, 2, { path: '/etc/x', anchor: null })).toBe(false);
    expect(records.get(id, 1)?.path).toBe('/d/b.md');
  });

  it('opens a new tab after the active one, or at the end when none is active', () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    tabs.open('/d/b.md', 1);
    expect(tabs.activate(a, 1)).toBe(true);
    tabs.open('/d/c.md', 1);
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/a.md', '/d/c.md', '/d/b.md']);
  });

  it("records the active tab only for the window that owns it", () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    expect(tabs.activate(a, 2)).toBe(false);
    expect(tabs.snapshot(1).active).toBeNull();
    tabs.activate(a, 1);
    expect(tabs.snapshot(1).active).toBe(a);
  });

  it("closes a tab, forgetting it as the active one", () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    tabs.open('/d/b.md', 1);
    tabs.activate(a, 1);
    expect(tabs.close(a, 2)).toBe(false);
    expect(tabs.close(a, 1)).toBe(true);
    expect(tabs.close(a, 1)).toBe(false);
    expect(tabs.get(a, 1)).toBeUndefined();
    expect(tabs.snapshot(1)).toMatchObject({ active: null, tabs: [{ path: '/d/b.md' }] });
  });

  it('reopens closed tabs newest first, at their old place, with their history, under a new id', () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    const b = tabs.open('/d/b.md', 1).id;
    tabs.open('/d/c.md', 1);
    tabs.navigate(b, 1, { path: '/d/b2.md', anchor: 'x' });
    tabs.close(a, 1);
    tabs.close(b, 1);
    const reopened = tabs.reopenClosed(1)!;
    expect(reopened).toEqual({ id: 'id-4', path: '/d/b2.md' });
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/b2.md', '/d/c.md']);
    expect(tabs.back(reopened.id, 1)).toEqual({ path: '/d/b.md', anchor: null });
    expect(tabs.reopenClosed(1)?.path).toBe('/d/a.md');
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/a.md', '/d/b.md', '/d/c.md']);
    expect(tabs.reopenClosed(1)).toBeNull();
    expect(tabs.reopenClosed(2)).toBeNull();
  });

  it('keeps the 25 most recently closed tabs per window', () => {
    const tabs = new TabRegistry(counterIds());
    const ids = Array.from({ length: 30 }, (_, n) => tabs.open(`/d/${n}.md`, 1).id);
    for (const id of ids) tabs.close(id, 1);
    const reopened: string[] = [];
    for (let tab = tabs.reopenClosed(1); tab; tab = tabs.reopenClosed(1)) reopened.push(tab.path);
    expect(reopened).toHaveLength(25);
    expect(reopened[0]).toBe('/d/29.md');
    expect(reopened.at(-1)).toBe('/d/5.md');
  });

  it('moves a tab to another place in its window, clamped to the ends', () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    tabs.open('/d/b.md', 1);
    const c = tabs.open('/d/c.md', 1).id;
    expect(tabs.move(a, 1, 1)).toBe(true);
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/b.md', '/d/a.md', '/d/c.md']);
    expect(tabs.move(c, 1, -5)).toBe(true);
    expect(tabs.move(a, 1, 99)).toBe(true);
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/c.md', '/d/b.md', '/d/a.md']);
    expect(tabs.move(a, 2, 0)).toBe(false);
  });

  it('counts a revision per window for every change, and none for reads or refusals', () => {
    const tabs = new TabRegistry(counterIds());
    expect(tabs.snapshot(1).revision).toBe(0);
    const a = tabs.open('/d/a.md', 1).id;
    tabs.open('/d/x.md', 2);
    expect(tabs.snapshot(1).revision).toBe(1);
    tabs.activate(a, 1);
    tabs.navigate(a, 1, { path: '/d/b.md', anchor: null });
    tabs.back(a, 1);
    tabs.move(a, 1, 0);
    expect(tabs.snapshot(1).revision).toBe(5);
    tabs.get(a, 1);
    tabs.list(1);
    tabs.back(a, 1);
    tabs.close(a, 2);
    tabs.activate(a, 2);
    expect(tabs.snapshot(1).revision).toBe(5);
    tabs.close(a, 1);
    tabs.reopenClosed(1);
    expect(tabs.snapshot(1).revision).toBe(7);
  });

  it('keeps counting revisions after a window closes, so an old snapshot never looks newer', () => {
    const tabs = new TabRegistry(counterIds());
    tabs.open('/d/a.md', 1);
    tabs.closeWindow(1);
    expect(tabs.snapshot(1)).toEqual({ revision: 2, active: null, tabs: [] });
    expect(tabs.reopenClosed(1)).toBeNull();
  });
});

