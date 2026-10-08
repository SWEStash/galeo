import { describe, expect, it } from 'vitest';
import { EditGrants } from '../../../src/core/documents/edit-grants';

describe('EditGrants', () => {
  it('lets a tab be edited only once granted, for its own window and file', () => {
    const grants = new EditGrants();
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(false);
    grants.grant('t1', 1, '/d/a.md');
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(true);
    expect(grants.allows('t1', 2, '/d/a.md')).toBe(false);
    expect(grants.allows('t1', 1, '/d/b.md')).toBe(false);
    expect(grants.allows('t2', 1, '/d/a.md')).toBe(false);
  });

  it('takes the grant back when the page leaves edit mode, for its own window only', () => {
    const grants = new EditGrants();
    grants.grant('t1', 1, '/d/a.md');
    grants.revoke('t1', 2);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(true);
    grants.revoke('t1', 1);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(false);
  });

  it('knows which granted tabs have unsaved changes, per window', () => {
    const grants = new EditGrants();
    grants.grant('t1', 1, '/d/a.md');
    grants.grant('t2', 1, '/d/b.md');
    grants.grant('t3', 2, '/d/c.md');
    grants.setDirty('t1', 1, true);
    grants.setDirty('t3', 2, true);
    grants.setDirty('t9', 1, true);
    grants.setDirty('t3', 1, false);
    expect(grants.dirty(1)).toEqual(['t1']);
    expect(grants.dirty(2)).toEqual(['t3']);
    grants.setDirty('t1', 1, false);
    expect(grants.dirty(1)).toEqual([]);
  });

  it('forgets unsaved changes with the grant', () => {
    const grants = new EditGrants();
    grants.grant('t1', 1, '/d/a.md');
    grants.setDirty('t1', 1, true);
    grants.revoke('t1', 1);
    grants.grant('t1', 1, '/d/a.md');
    expect(grants.dirty(1)).toEqual([]);
  });

  it('drops the grants of tabs that closed or now show another file, in that window only', () => {
    const grants = new EditGrants();
    grants.grant('t1', 1, '/d/a.md');
    grants.grant('t2', 1, '/d/b.md');
    grants.grant('t3', 1, '/d/c.md');
    grants.grant('t9', 2, '/d/z.md');
    const dropped = grants.sync(1, [
      { id: 't1', path: '/d/a.md' },
      { id: 't2', path: '/d/other.md' },
    ]);
    expect(dropped.sort()).toEqual(['t2', 't3']);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(true);
    expect(grants.allows('t2', 1, '/d/other.md')).toBe(false);
    expect(grants.allows('t3', 1, '/d/c.md')).toBe(false);
    expect(grants.allows('t9', 2, '/d/z.md')).toBe(true);
  });

  it("drops a closed window's grants", () => {
    const grants = new EditGrants();
    grants.grant('t1', 1, '/d/a.md');
    grants.setDirty('t1', 1, true);
    grants.closeWindow(1);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(false);
    expect(grants.dirty(1)).toEqual([]);
  });
});
