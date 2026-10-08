import { describe, expect, it } from 'vitest';
import { EditGrants } from '../../../src/core/documents/edit-grants';

describe('EditGrants', () => {
  it('lets a tab be edited only once granted, for its own window and file', () => {
    const grants = new EditGrants();
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(false);
    expect(grants.toggle('t1', 1, '/d/a.md')).toBe(true);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(true);
    expect(grants.allows('t1', 2, '/d/a.md')).toBe(false);
    expect(grants.allows('t1', 1, '/d/b.md')).toBe(false);
    expect(grants.allows('t2', 1, '/d/a.md')).toBe(false);
  });

  it('takes the grant back on a second toggle, or when the page leaves edit mode', () => {
    const grants = new EditGrants();
    grants.toggle('t1', 1, '/d/a.md');
    expect(grants.toggle('t1', 1, '/d/a.md')).toBe(false);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(false);
    grants.toggle('t1', 1, '/d/a.md');
    grants.revoke('t1', 1);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(false);
  });

  it("ignores another window's request to revoke", () => {
    const grants = new EditGrants();
    grants.toggle('t1', 1, '/d/a.md');
    grants.revoke('t1', 2);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(true);
  });

  it('drops the grants of tabs that closed or now show another file, in that window only', () => {
    const grants = new EditGrants();
    grants.toggle('t1', 1, '/d/a.md');
    grants.toggle('t2', 1, '/d/b.md');
    grants.toggle('t3', 1, '/d/c.md');
    grants.toggle('t9', 2, '/d/z.md');
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
    grants.toggle('t1', 1, '/d/a.md');
    grants.closeWindow(1);
    expect(grants.allows('t1', 1, '/d/a.md')).toBe(false);
  });
});
