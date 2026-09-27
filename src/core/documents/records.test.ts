import { describe, expect, it } from 'vitest';
import { DocumentRecords } from './records';

function counterIds() {
  let n = 0;
  return () => `id-${++n}`;
}

describe('DocumentRecords', () => {
  it('opens a document in a window under a fresh opaque id', () => {
    const records = new DocumentRecords(counterIds());
    expect(records.open('/d/a.md', 1)).toEqual({ id: 'id-1', path: '/d/a.md' });
    expect(records.open('/d/b.md', 1)).toEqual({ id: 'id-2', path: '/d/b.md' });
  });

  it("lists a window's documents in opening order", () => {
    const records = new DocumentRecords(counterIds());
    records.open('/d/a.md', 1);
    records.open('/d/x.md', 2);
    records.open('/d/b.md', 1);
    expect(records.list(1).map((record) => record.path)).toEqual(['/d/a.md', '/d/b.md']);
    expect(records.list(3)).toEqual([]);
  });

  it('finds a document only for the window that owns it', () => {
    const records = new DocumentRecords(counterIds());
    const { id } = records.open('/d/a.md', 1);
    expect(records.get(id, 1)?.path).toBe('/d/a.md');
    expect(records.get(id, 2)).toBeUndefined();
    expect(records.get('/d/a.md', 1)).toBeUndefined();
    expect(records.get('id-99', 1)).toBeUndefined();
  });

  it('never hands out the same id twice, even if the source repeats', () => {
    const repeats = ['same', 'same', 'other'];
    const records = new DocumentRecords(() => repeats.shift()!);
    expect([records.open('/a', 1).id, records.open('/b', 1).id]).toEqual(['same', 'other']);
  });

  it('closes every document of a window', () => {
    const records = new DocumentRecords(counterIds());
    const { id } = records.open('/d/a.md', 1);
    records.open('/d/b.md', 2);
    records.closeWindow(1);
    expect(records.get(id, 1)).toBeUndefined();
    expect(records.list(2)).toHaveLength(1);
  });

  it('navigates a document to another file or anchor, with back and forward history', () => {
    const records = new DocumentRecords(counterIds());
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
    const records = new DocumentRecords(counterIds());
    const { id } = records.open('/d/a.md', 1);
    records.navigate(id, 1, { path: '/d/b.md', anchor: null });
    records.back(id, 1);
    records.navigate(id, 1, { path: '/d/c.md', anchor: null });
    expect(records.forward(id, 1)).toBeNull();
    expect(records.back(id, 1)).toEqual({ path: '/d/a.md', anchor: null });
  });

  it("refuses history moves on another window's document", () => {
    const records = new DocumentRecords(counterIds());
    const { id } = records.open('/d/a.md', 1);
    records.navigate(id, 1, { path: '/d/b.md', anchor: null });
    expect(records.back(id, 2)).toBeNull();
    expect(records.navigate(id, 2, { path: '/etc/x', anchor: null })).toBe(false);
    expect(records.get(id, 1)?.path).toBe('/d/b.md');
  });
});
