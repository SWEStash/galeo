import { describe, expect, it } from 'vitest';
import { ReadIdentities } from '../../../src/core/documents/identities';
import type { SentCopy } from '../../../src/core/documents/incremental';
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

describe('ReadIdentities: what main last sent each tab (ADR-033)', () => {
  const copy = (size: number): SentCopy => ({
    bytes: new Uint8Array(size),
    version: `v${size}`,
    state: { update: () => { throw new Error('unused'); }, digest: () => `v${size}` },
    encoding: 'utf-8',
    bom: false,
    guessed: false,
    endsClean: true,
    lines: { crlf: 0, lf: 0 },
    endsWithCr: false,
  });

  it('gives a tab its copy only for the file and encoding it was read from', () => {
    const reads = new ReadIdentities(new FakeFileSystem(), { minBytes: 1, maxTotalBytes: 100 });
    reads.sent('t1', '/d/a.log\0', copy(10));
    expect(reads.sentCopy('t1', '/d/a.log\0')?.version).toBe('v10');
    expect(reads.sentCopy('t1', '/d/b.log\0')).toBeNull();
    expect(reads.sentCopy('t1', '/d/a.log\0windows-1252')).toBeNull();
    expect(reads.sentCopy('t2', '/d/a.log\0')).toBeNull();
  });

  it('drops a tab\'s copy when told there is none, and when the tab is forgotten', () => {
    const reads = new ReadIdentities(new FakeFileSystem(), { minBytes: 1, maxTotalBytes: 100 });
    reads.sent('t1', '/d/a.log\0', copy(10));
    reads.sent('t1', '/d/a.log\0', null);
    expect(reads.sentCopy('t1', '/d/a.log\0')).toBeNull();
    reads.sent('t1', '/d/a.log\0', copy(10));
    reads.forget('t1');
    expect(reads.sentCopy('t1', '/d/a.log\0')).toBeNull();
  });
});
