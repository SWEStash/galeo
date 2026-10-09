import { describe, expect, it } from 'vitest';
import { ReadIdentities } from '../../../src/core/documents/identities';
import { FakeFileSystem } from '../../helpers/fakes';

describe('ReadIdentities', () => {
  it('says a file changed once its size or identity differs from the read', async () => {
    const fs = new FakeFileSystem({ '/d/a.md': 'one' });
    const reads = new ReadIdentities(fs);
    await reads.remember('t1', '/d/a.md');
    expect(await reads.changed('t1', '/d/a.md')).toBe(false);
    fs.write('/d/a.md', 'one more');
    expect(await reads.changed('t1', '/d/a.md')).toBe(true);
  });

  it('counts a file that went away, or a tab now showing another file, as changed', async () => {
    const fs = new FakeFileSystem({ '/d/a.md': 'one', '/d/b.md': 'one' });
    const reads = new ReadIdentities(fs);
    await reads.remember('t1', '/d/a.md');
    expect(await reads.changed('t1', '/d/b.md')).toBe(true);
    fs.delete('/d/a.md');
    expect(await reads.changed('t1', '/d/a.md')).toBe(true);
  });

  it('knows nothing about tabs it never read, or forgot', async () => {
    const fs = new FakeFileSystem({ '/d/a.md': 'one' });
    const reads = new ReadIdentities(fs);
    expect(await reads.changed('t1', '/d/a.md')).toBe(false);
    await reads.remember('t1', '/d/a.md');
    reads.forget('t1');
    fs.write('/d/a.md', 'changed');
    expect(await reads.changed('t1', '/d/a.md')).toBe(false);
  });

  it('remembers a missing file as missing, so its return counts as a change', async () => {
    const fs = new FakeFileSystem();
    const reads = new ReadIdentities(fs);
    await reads.remember('t1', '/d/a.md');
    expect(await reads.changed('t1', '/d/a.md')).toBe(false);
    fs.write('/d/a.md', 'back');
    expect(await reads.changed('t1', '/d/a.md')).toBe(true);
  });

  it("keeps the shape of each tab's last read for its own file, through later identities, until forgotten", async () => {
    const fs = new FakeFileSystem({ '/d/a.md': 'one' });
    const reads = new ReadIdentities(fs);
    const shape = { encoding: 'utf-8', bom: true, lineEnding: 'crlf' } as const;
    expect(reads.shapeOf('t1', '/d/a.md')).toBeNull();
    reads.saw('t1', '/d/a.md', shape);
    await reads.remember('t1', '/d/a.md');
    expect(reads.shapeOf('t1', '/d/a.md')).toEqual(shape);
    expect(reads.shapeOf('t1', '/d/b.md')).toBeNull();
    reads.forget('t1');
    expect(reads.shapeOf('t1', '/d/a.md')).toBeNull();
  });
});
