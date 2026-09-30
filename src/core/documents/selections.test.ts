import { describe, expect, it } from 'vitest';
import { SelectionGrants } from './selections';

function counterIds() {
  let n = 0;
  return () => `pick-${++n}`;
}

describe('SelectionGrants', () => {
  it('hands the page opaque ids for the paths main offers, and gives back the path of a chosen one', () => {
    const grants = new SelectionGrants(counterIds());
    const offered = grants.offer(1, 'recent', ['/d/a.md', '/d/b.md']);
    expect(offered).toEqual([
      { id: 'pick-1', path: '/d/a.md' },
      { id: 'pick-2', path: '/d/b.md' },
    ]);
    expect(grants.choose(1, 'recent', 'pick-2')).toBe('/d/b.md');
  });

  it("refuses an id main didn't offer, another window's, or another list's", () => {
    const grants = new SelectionGrants(counterIds());
    grants.offer(1, 'recent', ['/d/a.md']);
    expect(grants.choose(1, 'recent', '/etc/passwd')).toBeNull();
    expect(grants.choose(2, 'recent', 'pick-1')).toBeNull();
    expect(grants.choose(1, 'quick-open', 'pick-1')).toBeNull();
  });

  it('forgets the previous offer when it offers again: only the last list counts', () => {
    const grants = new SelectionGrants(counterIds());
    grants.offer(1, 'recent', ['/d/a.md']);
    grants.offer(1, 'recent', ['/d/b.md']);
    expect(grants.choose(1, 'recent', 'pick-1')).toBeNull();
    expect(grants.choose(1, 'recent', 'pick-2')).toBe('/d/b.md');
  });

  it('keeps the id of a path it offers again, so a pick made while the list updates still counts', () => {
    const grants = new SelectionGrants(counterIds());
    grants.offer(1, 'quick-open', ['/d/a.md', '/d/b.md']);
    const again = grants.offer(1, 'quick-open', ['/d/c.md', '/d/a.md']);
    expect(again).toEqual([
      { id: 'pick-3', path: '/d/c.md' },
      { id: 'pick-1', path: '/d/a.md' },
    ]);
    expect(grants.choose(1, 'quick-open', 'pick-1')).toBe('/d/a.md');
    expect(grants.choose(1, 'quick-open', 'pick-2')).toBeNull();
  });

  it("drops a closed window's offers", () => {
    const grants = new SelectionGrants(counterIds());
    grants.offer(1, 'recent', ['/d/a.md']);
    grants.closeWindow(1);
    expect(grants.choose(1, 'recent', 'pick-1')).toBeNull();
  });

  it('withdraws a list from every window', () => {
    const grants = new SelectionGrants(counterIds());
    grants.offer(1, 'recent', ['/d/a.md']);
    grants.offer(2, 'recent', ['/d/a.md']);
    grants.offer(1, 'quick-open', ['/d/b.md']);
    grants.withdraw('recent');
    expect(grants.choose(1, 'recent', 'pick-1')).toBeNull();
    expect(grants.choose(2, 'recent', 'pick-2')).toBeNull();
    expect(grants.choose(1, 'quick-open', 'pick-3')).toBe('/d/b.md');
  });
});

