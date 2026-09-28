import { describe, expect, it, vi } from 'vitest';
import { FsError } from '../../src/core/ports';
import { FakeClock, FakeFileSystem, FakeTaskRunner } from '../helpers/fakes';

describe('FakeClock', () => {
  it('fires due timers in time order as it advances', () => {
    const clock = new FakeClock(1_000);
    const fired: string[] = [];
    clock.setTimeout(() => fired.push('late'), 200);
    clock.setTimeout(() => fired.push('early'), 50);

    clock.advance(100);
    expect(fired).toEqual(['early']);
    expect(clock.now()).toBe(1_100);

    clock.advance(100);
    expect(fired).toEqual(['early', 'late']);
  });

  it('does not fire a cancelled timer', () => {
    const clock = new FakeClock();
    const callback = vi.fn();
    const cancel = clock.setTimeout(callback, 10);
    cancel();
    clock.advance(10);
    expect(callback).not.toHaveBeenCalled();
  });

  it('sees a timer scheduled by a firing timer when it falls inside the same advance', () => {
    const clock = new FakeClock();
    const fired: number[] = [];
    clock.setTimeout(() => {
      fired.push(clock.now());
      clock.setTimeout(() => fired.push(clock.now()), 10);
    }, 10);
    clock.advance(30);
    expect(fired).toEqual([10, 20]);
  });
});

describe('FakeFileSystem', () => {
  const text = (s: string) => new TextEncoder().encode(s);

  it('reads and stats files it holds', async () => {
    const fs = new FakeFileSystem({ '/docs/a.md': 'hello', '/docs/sub/b.md': 'b' });
    expect(new TextDecoder().decode(await fs.readFile('/docs/a.md', { maxBytes: 10 }))).toBe('hello');
    expect(await fs.stat('/docs/a.md')).toMatchObject({ kind: 'file', size: 5 });
    expect(await fs.stat('/docs/sub')).toMatchObject({ kind: 'directory' });
  });

  it.each([
    ['/missing.md', 'ENOENT'],
    ['/docs', 'EISDIR'],
  ] as const)('reading %s fails with %s', async (path, code) => {
    const fs = new FakeFileSystem({ '/docs/a.md': text('x') });
    await expect(fs.readFile(path, { maxBytes: 10 })).rejects.toMatchObject({ code });
  });

  it('refuses reads over the cap', async () => {
    const fs = new FakeFileSystem({ '/big.log': 'x'.repeat(11) });
    const error = await fs.readFile('/big.log', { maxBytes: 10 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FsError);
    expect(error).toMatchObject({ code: 'ETOOBIG' });
  });

  it('fails with an injected error code', async () => {
    const fs = new FakeFileSystem({ '/secret.md': 'x' });
    fs.failWith('/secret.md', 'EACCES');
    await expect(fs.readFile('/secret.md', { maxBytes: 10 })).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.stat('/secret.md')).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('lists a directory with entry kinds', async () => {
    const fs = new FakeFileSystem({ '/r/a.md': 'a', '/r/sub/b.md': 'b' });
    const entries = [];
    for await (const entry of fs.readDir('/r')) entries.push(entry);
    expect(entries).toEqual([
      { name: 'a.md', kind: 'file' },
      { name: 'sub', kind: 'directory' },
    ]);
  });

  it('creates directories and writes files with modes, refusing a missing parent', async () => {
    const fs = new FakeFileSystem();
    await expect(fs.writeFileAtomic('/cfg/s.json', text('{}'), { mode: 0o600 })).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.mkdir('/cfg', { mode: 0o700 });
    await fs.writeFileAtomic('/cfg/s.json', text('{}'), { mode: 0o600 });
    expect(await fs.stat('/cfg')).toMatchObject({ kind: 'directory' });
    expect(new TextDecoder().decode(await fs.readFile('/cfg/s.json', { maxBytes: 10 }))).toBe('{}');
    expect([fs.modeOf('/cfg'), fs.modeOf('/cfg/s.json'), fs.modeOf('/nope')]).toEqual([0o700, 0o600, undefined]);
    fs.failWith('/cfg/s.json', 'EACCES');
    await expect(fs.writeFileAtomic('/cfg/s.json', text('x'), { mode: 0o600 })).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('resolves registered symlinks in realpath', async () => {
    const fs = new FakeFileSystem({ '/real/a.md': 'a' });
    fs.symlink('/link', '/real');
    expect(await fs.realpath('/link/a.md')).toBe('/real/a.md');
  });
});

describe('FakeTaskRunner', () => {
  it('runs a registered task', async () => {
    const runner = new FakeTaskRunner({ double: (n) => (n as number) * 2 });
    await expect(runner.run('double', 21, { timeoutMs: 100 })).resolves.toEqual({ ok: true, value: 42 });
  });

  it('reports a timeout for a task marked as hanging', async () => {
    const runner = new FakeTaskRunner({ slow: () => 1 });
    runner.hang('slow');
    await expect(runner.run('slow', null, { timeoutMs: 100 })).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('reports an error when the task throws', async () => {
    const runner = new FakeTaskRunner({
      boom: () => {
        throw new Error('bad input');
      },
    });
    await expect(runner.run('boom', null, { timeoutMs: 100 })).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'bad input',
    });
  });
});
