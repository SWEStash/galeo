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

  it("lists a window's closed tabs newest first, by their last id and the file they showed", () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    const b = tabs.open('/d/b.md', 1).id;
    tabs.open('/d/x.md', 2);
    tabs.navigate(b, 1, { path: '/d/b2.md', anchor: null });
    tabs.close(a, 1);
    tabs.close(b, 1);
    expect(tabs.closedList(1)).toEqual([
      { id: b, path: '/d/b2.md' },
      { id: a, path: '/d/a.md' },
    ]);
    expect(tabs.closedList(2)).toEqual([]);
  });

  it('reopens one closed tab by its id, at its old place with its history and look; the rest stay', () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    const b = tabs.open('/d/b.md', 1).id;
    const c = tabs.open('/d/c.md', 1).id;
    tabs.open('/d/d.md', 1);
    tabs.navigate(b, 1, { path: '/d/b2.md', anchor: null });
    tabs.setZoom(b, 1, 1.5);
    tabs.setWidth(b, 1, 90);
    tabs.close(a, 1);
    tabs.close(b, 1);
    tabs.close(c, 1);
    const lastClosed = tabs.closedAt(1);
    expect(tabs.reopenClosedById(2, b)).toBeNull();
    expect(tabs.reopenClosedById(1, 'id-99')).toBeNull();
    const reopened = tabs.reopenClosedById(1, b)!;
    expect(reopened.path).toBe('/d/b2.md');
    expect(reopened.id).not.toBe(b);
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/b2.md', '/d/d.md']);
    expect(tabs.snapshot(1).tabs[0]).toMatchObject({ zoom: 1.5, width: 90 });
    expect(tabs.back(reopened.id, 1)).toEqual({ path: '/d/b.md', anchor: null });
    expect(tabs.closedList(1).map((tab) => tab.id)).toEqual([c, a]);
    expect(tabs.closedAt(1)).toBe(lastClosed);
    expect(tabs.reopenClosedById(1, b)).toBeNull();
    expect(tabs.reopenClosed(1)?.path).toBe('/d/c.md');
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

  it('tells its listener which window changed, once per change', () => {
    const changed: number[] = [];
    const tabs = new TabRegistry(counterIds(), (window) => changed.push(window));
    const a = tabs.open('/d/a.md', 1).id;
    tabs.open('/d/x.md', 2);
    tabs.activate(a, 2);
    tabs.close(a, 1);
    expect(changed).toEqual([1, 2, 1]);
  });

  it('opens a tab at an anchor, for a link opened in a new tab', () => {
    const tabs = new TabRegistry(counterIds());
    const { id } = tabs.open('/d/a.md', 1, 'intro');
    tabs.navigate(id, 1, { path: '/d/b.md', anchor: null });
    expect(tabs.back(id, 1)).toEqual({ path: '/d/a.md', anchor: 'intro' });
  });

  it('keeps the scroll position of each history entry, for back and forward', () => {
    const changed: number[] = [];
    const tabs = new TabRegistry(counterIds(), (window) => changed.push(window));
    const { id } = tabs.open('/d/a.md', 1);
    const at = (line: number) => ({ line, offset: 4, heading: null, fraction: 0.5 });
    const before = changed.length;
    const revision = tabs.snapshot(1).revision;
    expect(tabs.setPosition(id, 1, at(10))).toBe(true);
    expect(tabs.setPosition(id, 2, at(99))).toBe(false);
    expect([changed.length, tabs.snapshot(1).revision]).toEqual([before, revision]);
    tabs.navigate(id, 1, { path: '/d/b.md', anchor: null });
    tabs.setPosition(id, 1, at(20));
    expect(tabs.back(id, 1)).toEqual({ path: '/d/a.md', anchor: null, position: at(10) });
    expect(tabs.forward(id, 1)).toEqual({ path: '/d/b.md', anchor: null, position: at(20) });
    expect(tabs.position(id, 1)).toEqual(at(20));
    expect(tabs.position(id, 2)).toBeNull();
  });

  it("keeps each entry's chosen view and follow state quietly, and shows them in snapshots and the session", () => {
    const changed: number[] = [];
    const tabs = new TabRegistry(counterIds(), (window) => changed.push(window));
    const { id } = tabs.open('/d/a.log', 1);
    const before = changed.length;
    expect(tabs.setViewState(id, 1, { view: 'source', follow: true })).toBe(true);
    expect(tabs.setViewState(id, 2, { view: 'source' })).toBe(false);
    expect(changed.length).toBe(before);
    expect(tabs.snapshot(1).tabs[0]).toMatchObject({ view: 'source', follow: true });
    expect(tabs.exportWindow(1).tabs[0]!.entries[0]).toEqual({ path: '/d/a.log', anchor: null, view: 'source', follow: true });
    tabs.setViewState(id, 1, {});
    expect(tabs.exportWindow(1).tabs[0]!.entries[0]).toEqual({ path: '/d/a.log', anchor: null });
    tabs.setViewState(id, 1, { follow: true });
    tabs.navigate(id, 1, { path: '/d/b.md', anchor: null });
    expect(tabs.snapshot(1).tabs[0]).not.toHaveProperty('follow');
  });

  it("keeps a split entry's divider ratio with its view, in snapshots and the session", () => {
    const tabs = new TabRegistry(counterIds());
    const { id } = tabs.open('/d/a.md', 1);
    tabs.setViewState(id, 1, { view: 'split', ratio: 0.3 });
    expect(tabs.snapshot(1).tabs[0]).toMatchObject({ view: 'split', ratio: 0.3 });
    expect(tabs.exportWindow(1).tabs[0]!.entries[0]).toEqual({ path: '/d/a.md', anchor: null, view: 'split', ratio: 0.3 });
    tabs.setViewState(id, 1, { view: 'split' });
    expect(tabs.snapshot(1).tabs[0]).not.toHaveProperty('ratio');
  });

  it("keeps an entry's table options with its view, in snapshots and the session (ADR-021)", () => {
    const tabs = new TabRegistry(counterIds());
    const { id } = tabs.open('/d/a.csv', 1);
    tabs.setViewState(id, 1, { table: { separator: ',', header: false } });
    expect(tabs.snapshot(1).tabs[0]).toMatchObject({ table: { separator: ',', header: false } });
    expect(tabs.exportWindow(1).tabs[0]!.entries[0]).toEqual({ path: '/d/a.csv', anchor: null, table: { separator: ',', header: false } });
    tabs.setViewState(id, 1, {});
    expect(tabs.snapshot(1).tabs[0]).not.toHaveProperty('table');
  });

  it('opens a tab at the start when asked to open it after no tab', () => {
    const tabs = new TabRegistry(counterIds());
    tabs.open('/d/a.md', 1);
    tabs.open('/d/b.md', 1);
    tabs.open('/d/first.md', 1, null, null);
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/first.md', '/d/a.md', '/d/b.md']);
  });

  it("keeps a chosen encoding for the entry's file only", () => {
    const tabs = new TabRegistry(counterIds());
    const { id } = tabs.open('/d/a.txt', 1);
    expect(tabs.encoding(id, 1)).toBeNull();
    expect(tabs.setEncoding(id, 1, 'windows-1252')).toBe(true);
    expect(tabs.setEncoding(id, 2, 'utf-8')).toBe(false);
    // A change the session keeps: it counts as one.
    expect(tabs.snapshot(1).revision).toBe(2);
    expect(tabs.encoding(id, 1)).toBe('windows-1252');
    tabs.navigate(id, 1, { path: '/d/b.txt', anchor: null });
    expect(tabs.encoding(id, 1)).toBeNull();
    tabs.back(id, 1);
    expect(tabs.encoding(id, 1)).toBe('windows-1252');
  });

  it("marks the file of a tab's current entry as the reader's choice; links elsewhere aren't, back is again", () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    expect(tabs.chosen(a, 1)).toBe(false);
    expect(tabs.markChosen(a, 2)).toBe(false);
    expect(tabs.markChosen(a, 1)).toBe(true);
    expect(tabs.chosen(a, 1)).toBe(true);
    expect(tabs.chosen(a, 2)).toBe(false);

    tabs.navigate(a, 1, { path: '/d/a.md', anchor: 'later' });
    expect(tabs.chosen(a, 1)).toBe(true);
    tabs.navigate(a, 1, { path: '/d/other.md', anchor: null });
    expect(tabs.chosen(a, 1)).toBe(false);
    tabs.back(a, 1);
    expect(tabs.chosen(a, 1)).toBe(true);
  });

  it('keeps the choice through the session and a reopened tab, and never shows it to the page', () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    tabs.markChosen(a, 1);
    expect(tabs.snapshot(1).tabs[0]).not.toHaveProperty('chosen');
    const saved = tabs.exportWindow(1);
    expect(saved.tabs[0]!.entries[0]).toEqual({ path: '/d/a.md', anchor: null, chosen: true });
    const next = new TabRegistry(counterIds());
    expect(next.chosen(next.restoreWindow(3, saved)[0]!.id, 3)).toBe(true);

    tabs.close(a, 1);
    expect(tabs.chosen(tabs.reopenClosed(1)!.id, 1)).toBe(true);
  });

  it("exports a window's tabs for the session and restores them in another run, under new ids", () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1).id;
    const b = tabs.open('/d/b.txt', 1).id;
    const where = { line: 5, offset: 1, heading: null, fraction: 0.2 };
    tabs.navigate(a, 1, { path: '/d/a2.md', anchor: 'x' });
    tabs.setPosition(a, 1, where);
    tabs.setEncoding(b, 1, 'windows-1252');
    tabs.setZoom(b, 1, 1.25);
    tabs.activate(b, 1);
    const saved = tabs.exportWindow(1);
    expect(saved).toEqual({
      active: 1,
      tabs: [
        { entries: [{ path: '/d/a.md', anchor: null }, { path: '/d/a2.md', anchor: 'x', position: where }], index: 1 },
        { entries: [{ path: '/d/b.txt', anchor: null, encoding: 'windows-1252' }], index: 0, zoom: 1.25 },
      ],
    });

    const next = new TabRegistry(() => `new-${Math.random()}`);
    const restored = next.restoreWindow(7, saved);
    expect(restored.map((tab) => tab.path)).toEqual(['/d/a2.md', '/d/b.txt']);
    expect(restored.map((tab) => tab.id).some((id) => id === a || id === b)).toBe(false);
    expect(next.snapshot(7).active).toBe(restored[1]!.id);
    expect(next.back(restored[0]!.id, 7)).toEqual({ path: '/d/a.md', anchor: null });
    expect(next.encoding(restored[1]!.id, 7)).toBe('windows-1252');
  });

  it('shows each tab its zoom and last position in snapshots', () => {
    const tabs = new TabRegistry(counterIds());
    const { id } = tabs.open('/d/a.md', 1);
    const where = { line: 9, offset: 0, heading: null, fraction: 0.5 };
    tabs.setPosition(id, 1, where);
    const revision = tabs.snapshot(1).revision;
    expect(tabs.setZoom(id, 1, 1.5)).toBe(true);
    expect(tabs.setZoom(id, 2, 2)).toBe(false);
    expect(tabs.snapshot(1)).toMatchObject({ revision: revision + 1, tabs: [{ id, path: '/d/a.md', zoom: 1.5, position: where }] });
    tabs.setZoom(id, 1, 1);
    expect(tabs.snapshot(1).tabs[0]).not.toHaveProperty('zoom');
  });

  it('shows each tab its own reader width in snapshots, and none once cleared', () => {
    const tabs = new TabRegistry(counterIds());
    const { id } = tabs.open('/d/a.md', 1);
    const revision = tabs.snapshot(1).revision;
    expect(tabs.setWidth(id, 1, 96)).toBe(true);
    expect(tabs.setWidth(id, 2, 'full')).toBe(false);
    expect(tabs.snapshot(1)).toMatchObject({ revision: revision + 1, tabs: [{ id, width: 96 }] });
    tabs.setWidth(id, 1, 'full');
    expect(tabs.snapshot(1).tabs[0]!.width).toBe('full');
    tabs.setWidth(id, 1, null);
    expect(tabs.snapshot(1).tabs[0]).not.toHaveProperty('width');
  });

  it('keeps reader widths across a session and brings a reopened tab back at its width', () => {
    const tabs = new TabRegistry(counterIds());
    const { id: a } = tabs.open('/d/a.md', 1);
    const { id: b } = tabs.open('/d/b.md', 1);
    tabs.setWidth(a, 1, 'full');
    tabs.setWidth(b, 1, 56);
    const saved = tabs.exportWindow(1);
    expect(saved.tabs.map((tab) => tab.width)).toEqual(['full', 56]);
    const next = new TabRegistry(() => `new-${Math.random()}`);
    next.restoreWindow(7, saved);
    expect(next.snapshot(7).tabs.map((tab) => tab.width)).toEqual(['full', 56]);

    tabs.close(b, 1);
    tabs.reopenClosed(1);
    expect(tabs.snapshot(1).tabs.map((tab) => tab.width)).toEqual(['full', 56]);
  });

  it('keeps the last 50 entries of a history, so the session can always hold it', () => {
    const tabs = new TabRegistry(counterIds());
    const { id } = tabs.open('/d/a.md', 1);
    for (let n = 1; n <= 60; n++) tabs.navigate(id, 1, { path: '/d/a.md', anchor: `h${n}` });
    const [tab] = tabs.exportWindow(1).tabs;
    expect(tab!.entries).toHaveLength(50);
    expect(tab!.index).toBe(49);
    expect(tab!.entries[0]!.anchor).toBe('h11');
    expect(tabs.back(id, 1)).toEqual({ path: '/d/a.md', anchor: 'h59' });
  });

  it('brings a reopened tab back at its zoom', () => {
    const tabs = new TabRegistry(counterIds());
    const { id } = tabs.open('/d/a.md', 1);
    tabs.setZoom(id, 1, 1.5);
    tabs.close(id, 1);
    tabs.reopenClosed(1);
    expect(tabs.snapshot(1).tabs[0]!.zoom).toBe(1.5);
  });

  it('finds the tab showing a path in a window, by its current entry only', () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1);
    tabs.open('/d/a.md', 2);
    const b = tabs.open('/d/b.md', 1);
    tabs.navigate(b.id, 1, { path: '/d/c.md', anchor: null });
    expect(tabs.find('/d/a.md', 1)).toEqual(a);
    expect(tabs.find('/d/c.md', 1)?.id).toBe(b.id);
    expect(tabs.find('/d/b.md', 1)).toBeUndefined();
    expect(tabs.find('/d/a.md', 3)).toBeUndefined();
  });

  it('opens a tab right after a given one', () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1);
    tabs.open('/d/b.md', 1);
    tabs.activate(a.id, 1);
    const c = tabs.open('/d/c.md', 1, null, a.id);
    tabs.open('/d/d.md', 1, null, c.id);
    expect(tabs.list(1).map((tab) => tab.path)).toEqual(['/d/a.md', '/d/c.md', '/d/d.md', '/d/b.md']);
  });

  it('says when the window last closed a tab, on a clock it shares with stamp()', () => {
    const tabs = new TabRegistry(counterIds());
    const a = tabs.open('/d/a.md', 1);
    expect(tabs.closedAt(1)).toBeNull();
    tabs.close(a.id, 1);
    const closed = tabs.closedAt(1)!;
    const later = tabs.stamp();
    expect(later).toBeGreaterThan(closed);
    const b = tabs.open('/d/b.md', 1);
    tabs.close(b.id, 1);
    expect(tabs.closedAt(1)).toBeGreaterThan(later);
    tabs.reopenClosed(1);
    expect(tabs.closedAt(1)).toBe(closed);
  });

  describe('the settings tab (UX: a special tab, one per window)', () => {
    it('opens after the shown tab, shown, and is a tab like the others', () => {
      const tabs = new TabRegistry(counterIds());
      const a = tabs.open('/d/a.md', 1);
      tabs.open('/d/b.md', 1);
      tabs.activate(a.id, 1);
      const settings = tabs.openSettings(1);
      expect(settings).toEqual({ id: settings.id, path: '', kind: 'settings' });
      expect(tabs.list(1).map((tab) => tab.kind ?? tab.path)).toEqual(['/d/a.md', 'settings', '/d/b.md']);
      expect(tabs.snapshot(1).active).toBe(settings.id);
    });

    it('is a settings tab in every snapshot the window gets, the first included', () => {
      const snapshots: string[][] = [];
      const tabs: TabRegistry = new TabRegistry(counterIds(), (window) => snapshots.push(tabs.snapshot(window).tabs.map((tab) => tab.kind ?? tab.path)));
      tabs.openSettings(1);
      expect(snapshots.every((tabsSeen) => tabsSeen.every((kind) => kind === 'settings'))).toBe(true);
    });

    it('is shown again rather than opened twice', () => {
      const tabs = new TabRegistry(counterIds());
      const first = tabs.openSettings(1);
      const other = tabs.open('/d/a.md', 1);
      tabs.activate(other.id, 1);
      expect(tabs.openSettings(1).id).toBe(first.id);
      expect(tabs.list(1)).toHaveLength(2);
      expect(tabs.snapshot(1).active).toBe(first.id);
    });

    it('stays out of the session, which keeps the shown document instead', () => {
      const tabs = new TabRegistry(counterIds());
      tabs.open('/d/a.md', 1);
      tabs.openSettings(1);
      expect(tabs.exportWindow(1)).toEqual({ tabs: [{ entries: [{ path: '/d/a.md', anchor: null }], index: 0 }], active: null });
    });

    it('is never found by path, nor reopened with Ctrl+Shift+T', () => {
      const tabs = new TabRegistry(counterIds());
      const settings = tabs.openSettings(1);
      expect(tabs.find('', 1)).toBeUndefined();
      tabs.close(settings.id, 1);
      expect(tabs.closedAt(1)).toBeNull();
      expect(tabs.closedList(1)).toEqual([]);
      expect(tabs.reopenClosed(1)).toBeNull();
    });
  });

  it('marks a tab that crashed the window until the reader asks to render it again; the session never keeps it', () => {
    const changes: number[] = [];
    const records = new TabRegistry(counterIds(), (window) => changes.push(window));
    const { id } = records.open('/d/a.md', 1);
    records.open('/d/b.md', 1);
    expect(records.markCrashed(id, 2)).toBe(false);
    expect(records.markCrashed(id, 1)).toBe(true);
    expect(records.snapshot(1).tabs.map((tab) => tab.crashed ?? false)).toEqual([true, false]);
    expect(JSON.stringify(records.exportWindow(1))).not.toContain('crashed');
    expect(records.clearCrashed(id, 2)).toBe(false);
    expect(records.clearCrashed(id, 1)).toBe(true);
    expect(records.snapshot(1).tabs.every((tab) => !('crashed' in tab))).toBe(true);
    expect(changes).toEqual([1, 1, 1, 1]);
  });

  describe('moving a tab to another window (ADR-019)', () => {
    it('keeps its id, history, place, look and choices, at the position asked, shown there', () => {
      const tabs = new TabRegistry(counterIds());
      const a = tabs.open('/d/a.md', 1).id;
      tabs.navigate(a, 1, { path: '/d/b.md', anchor: null });
      tabs.markChosen(a, 1);
      tabs.setPosition(a, 1, { line: 4, offset: 2, heading: 'Intro', fraction: 0.5 });
      tabs.setViewState(a, 1, { view: 'split', ratio: 0.4 });
      tabs.setZoom(a, 1, 1.25);
      tabs.setWidth(a, 1, 'full');
      tabs.markCrashed(a, 1);
      tabs.open('/d/x.md', 2);
      tabs.open('/d/y.md', 2);
      const before = tabs.snapshot(1).tabs[0]!;

      expect(tabs.transfer(a, 1, 2, 1)).toBe(true);

      expect(tabs.list(1)).toEqual([]);
      expect(tabs.get(a, 1)).toBeUndefined();
      expect(tabs.list(2).map((tab) => tab.path)).toEqual(['/d/x.md', '/d/b.md', '/d/y.md']);
      const after = tabs.snapshot(2);
      expect(after.active).toBe(a);
      expect(after.tabs[1]).toEqual(before);
      expect(tabs.chosen(a, 2)).toBe(true);
      expect(tabs.back(a, 2)?.path).toBe('/d/a.md');
    });

    it('clamps the position to the ends of the window it goes to', () => {
      const tabs = new TabRegistry(counterIds());
      const a = tabs.open('/d/a.md', 1).id;
      tabs.open('/d/x.md', 2);
      tabs.transfer(a, 1, 2, 99);
      expect(tabs.list(2).map((tab) => tab.path)).toEqual(['/d/x.md', '/d/a.md']);
    });

    it('leaves the window it left with no shown tab of its own choosing, and the rest in order', () => {
      const tabs = new TabRegistry(counterIds());
      const a = tabs.open('/d/a.md', 1).id;
      const b = tabs.open('/d/b.md', 1).id;
      tabs.activate(b, 1);
      tabs.transfer(b, 1, 2, 0);
      expect(tabs.list(1).map((tab) => tab.id)).toEqual([a]);
      expect(tabs.snapshot(1).active).toBeNull();
    });

    it('is not a close: the window it left cannot reopen it', () => {
      const tabs = new TabRegistry(counterIds());
      tabs.open('/d/a.md', 1);
      const b = tabs.open('/d/b.md', 1).id;
      tabs.transfer(b, 1, 2, 0);
      expect(tabs.closedAt(1)).toBeNull();
      expect(tabs.closedList(1)).toEqual([]);
      expect(tabs.reopenClosed(1)).toBeNull();
    });

    it('moves only a tab the window owns, never the settings tab, and never into the same window', () => {
      const tabs = new TabRegistry(counterIds());
      const a = tabs.open('/d/a.md', 1).id;
      const settings = tabs.openSettings(1).id;
      expect(tabs.transfer(a, 3, 2, 0)).toBe(false);
      expect(tabs.transfer(settings, 1, 2, 0)).toBe(false);
      expect(tabs.transfer(a, 1, 1, 0)).toBe(false);
      expect(tabs.list(1).map((tab) => tab.id)).toEqual([a, settings]);
      expect(tabs.list(2)).toEqual([]);
    });

    it('tells of the window it left before the window it reached, once each', () => {
      const changes: number[] = [];
      const tabs = new TabRegistry(counterIds(), (window) => changes.push(window));
      const a = tabs.open('/d/a.md', 1).id;
      changes.length = 0;
      tabs.transfer(a, 1, 2, 0);
      expect(changes).toEqual([1, 2]);
    });

    it('goes into the session of the window it reached', () => {
      const tabs = new TabRegistry(counterIds());
      const a = tabs.open('/d/a.md', 1).id;
      tabs.open('/d/b.md', 1);
      tabs.setZoom(a, 1, 1.5);
      tabs.transfer(a, 1, 2, 0);
      expect(tabs.exportWindow(1).tabs.map((tab) => tab.entries[0]!.path)).toEqual(['/d/b.md']);
      expect(tabs.exportWindow(2)).toEqual({ tabs: [{ entries: [{ path: '/d/a.md', anchor: null }], index: 0, zoom: 1.5 }], active: 0 });
    });
  });
});
