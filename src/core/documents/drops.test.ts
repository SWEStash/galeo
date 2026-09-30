import { describe, expect, it } from 'vitest';
import { DropGrants } from './drops';

function counterIds() {
  let n = 0;
  return () => `drop-${++n}`;
}

describe('DropGrants', () => {
  it("gives the files of a real drop back once, to the window they were dropped on", () => {
    const drops = new DropGrants(counterIds());
    const token = drops.grant(1, ['/d/a.md', '/d/b.md']);
    expect(drops.take(2, token)).toBeNull();
    expect(drops.take(1, token)).toEqual(['/d/a.md', '/d/b.md']);
    expect(drops.take(1, token)).toBeNull();
  });

  it('refuses a token it never gave, and forgets a closed window’s drops', () => {
    const drops = new DropGrants(counterIds());
    const token = drops.grant(1, ['/d/a.md']);
    expect(drops.take(1, '/etc/passwd')).toBeNull();
    drops.closeWindow(1);
    expect(drops.take(1, token)).toBeNull();
  });

  it('keeps only the latest few drops per window', () => {
    const drops = new DropGrants(counterIds());
    const tokens = Array.from({ length: 6 }, (_, n) => drops.grant(1, [`/d/${n}.md`]));
    expect(drops.take(1, tokens[0]!)).toBeNull();
    expect(drops.take(1, tokens[5]!)).toEqual(['/d/5.md']);
  });
});
