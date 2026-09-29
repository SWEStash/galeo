import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { FsError, type DirEntry } from '../../core/ports';
import { NodeFileSystem } from './file-system';

const fs = new NodeFileSystem();
const posix = process.platform !== 'win32';
const root = typeof process.getuid === 'function' && process.getuid() === 0;

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'galeo-fs-'));
  onTestFinished(() => {
    if (posix) chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function file(dir: string, name: string, content: string | Uint8Array = ''): string {
  const target = path.join(dir, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(FsError);
  return (error as FsError).code;
}

describe('NodeFileSystem.stat', () => {
  it('describes a regular file, with an identity that survives a rename', async () => {
    const dir = tempDir();
    const target = file(dir, 'a.md', 'hello');
    const before = await fs.stat(target);
    expect(before).toMatchObject({ kind: 'file', size: 5 });
    expect(before.mtimeMs).toBeGreaterThan(0);
    const moved = path.join(dir, 'b.md');
    renameSync(target, moved);
    expect((await fs.stat(moved)).id).toBe(before.id);
  });

  it.runIf(posix)('says whether any execute bit is set (SR-05)', async () => {
    const dir = tempDir();
    const target = file(dir, 'tool', '#!/bin/sh');
    expect((await fs.stat(target)).executable).toBe(false);
    chmodSync(target, 0o744);
    expect((await fs.stat(target)).executable).toBe(true);
    chmodSync(target, 0o601);
    expect((await fs.stat(target)).executable).toBe(true);
  });

  it('gives a replaced file a new identity', async () => {
    const dir = tempDir();
    const target = file(dir, 'a.md', 'one');
    const before = await fs.stat(target);
    // An agent's atomic save: write a temp file, then rename it over the original.
    renameSync(file(dir, 'a.md.tmp', 'two'), target);
    expect((await fs.stat(target)).id).not.toBe(before.id);
  });

  it('reports directories', async () => {
    expect(await fs.stat(tempDir())).toMatchObject({ kind: 'directory' });
  });

  it('rejects a missing path with ENOENT', async () => {
    expect(await codeOf(fs.stat(path.join(tempDir(), 'nope.md')))).toBe('ENOENT');
  });
});

describe('NodeFileSystem.readFile', () => {
  it('reads the bytes of a regular file', async () => {
    const target = file(tempDir(), 'a.bin', Uint8Array.from([0, 1, 2, 255]));
    expect([...(await fs.readFile(target, { maxBytes: 4 }))]).toEqual([0, 1, 2, 255]);
  });

  it('refuses a file over the cap with ETOOBIG', async () => {
    const target = file(tempDir(), 'big.log', 'x'.repeat(11));
    expect(await codeOf(fs.readFile(target, { maxBytes: 10 }))).toBe('ETOOBIG');
  });

  it('refuses a directory with EISDIR', async () => {
    expect(await codeOf(fs.readFile(tempDir(), { maxBytes: 10 }))).toBe('EISDIR');
  });

  it('rejects a missing file with ENOENT', async () => {
    expect(await codeOf(fs.readFile(path.join(tempDir(), 'nope.md'), { maxBytes: 10 }))).toBe('ENOENT');
  });

  it.skipIf(!posix || root)('rejects an unreadable file with EACCES', async () => {
    const target = file(tempDir(), 'secret.md', 'x');
    chmodSync(target, 0o000);
    expect(await codeOf(fs.readFile(target, { maxBytes: 10 }))).toBe('EACCES');
  });

  it.skipIf(!posix)('refuses a FIFO without blocking on it', async () => {
    const fifo = path.join(tempDir(), 'pipe.md');
    execFileSync('mkfifo', [fifo]);
    expect(await codeOf(fs.readFile(fifo, { maxBytes: 10 }))).toBe('ENOTFILE');
  });

  it.skipIf(!posix)('reads a regular file through a symlink', async () => {
    const dir = tempDir();
    const target = file(dir, 'real.md', 'via link');
    const link = path.join(dir, 'link.md');
    symlinkSync(target, link);
    expect(new TextDecoder().decode(await fs.readFile(link, { maxBytes: 100 }))).toBe('via link');
  });
});

describe('NodeFileSystem.realpath', () => {
  it.skipIf(!posix)('resolves symlinks', async () => {
    const dir = tempDir();
    const target = file(dir, 'real.md');
    symlinkSync(target, path.join(dir, 'link.md'));
    expect(await fs.realpath(path.join(dir, 'link.md'))).toBe(await fs.realpath(target));
  });

  it('rejects a missing path with ENOENT', async () => {
    expect(await codeOf(fs.realpath(path.join(tempDir(), 'nope')))).toBe('ENOENT');
  });
});

describe('NodeFileSystem.readDir', () => {
  it('lists entries without following symlinks', async () => {
    const dir = tempDir();
    file(dir, 'a.md');
    file(dir, 'sub/b.md');
    if (posix) symlinkSync(path.join(dir, 'sub'), path.join(dir, 'loop'));
    const entries: DirEntry[] = [];
    for await (const entry of fs.readDir(dir)) entries.push(entry);
    expect(entries.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'a.md', kind: 'file' },
      ...(posix ? [{ name: 'loop', kind: 'symlink' }] : []),
      { name: 'sub', kind: 'directory' },
    ]);
  });

  it('rejects a file with ENOTDIR', async () => {
    const target = file(tempDir(), 'a.md');
    expect(await codeOf((async () => { for await (const _ of fs.readDir(target)) break; })())).toBe('ENOTDIR');
  });
});

function modeOf(target: string): number {
  return statSync(target).mode & 0o777;
}

describe('NodeFileSystem.mkdir', () => {
  it.runIf(posix)('creates missing parents with the given mode, and tightens an existing directory', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'a', 'b');
    await fs.mkdir(target, { mode: 0o700 });
    expect(modeOf(target)).toBe(0o700);
    chmodSync(target, 0o755);
    await fs.mkdir(target, { mode: 0o700 });
    expect(modeOf(target)).toBe(0o700);
  });

  it('refuses a path under a file', async () => {
    const dir = tempDir();
    const blocker = file(dir, 'plain');
    expect(await codeOf(fs.mkdir(path.join(blocker, 'x'), { mode: 0o700 }))).toBe('ENOTDIR');
  });
});

describe('NodeFileSystem.writeFileAtomic', () => {
  it.runIf(posix)('writes the whole file with the given mode, whatever the umask', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'settings.json');
    const umask = process.umask(0o000);
    try {
      await fs.writeFileAtomic(target, new TextEncoder().encode('{"a":1}'), { mode: 0o600 });
    } finally {
      process.umask(umask);
    }
    expect(readFileSync(target, 'utf8')).toBe('{"a":1}');
    expect(modeOf(target)).toBe(0o600);
  });

  it('replaces an existing file and leaves no temporary file behind', async () => {
    const dir = tempDir();
    const target = file(dir, 'session.json', 'old');
    await fs.writeFileAtomic(target, new TextEncoder().encode('new'), { mode: 0o600 });
    expect(readFileSync(target, 'utf8')).toBe('new');
    expect(readdirSync(dir)).toEqual(['session.json']);
  });

  it.runIf(posix)('tightens the mode of a file it replaces', async () => {
    const dir = tempDir();
    const target = file(dir, 'session.json', 'old');
    chmodSync(target, 0o644);
    await fs.writeFileAtomic(target, new TextEncoder().encode('new'), { mode: 0o600 });
    expect(modeOf(target)).toBe(0o600);
  });

  it('refuses a missing directory and cleans up', async () => {
    const dir = tempDir();
    expect(await codeOf(fs.writeFileAtomic(path.join(dir, 'no', 'x.json'), new Uint8Array(), { mode: 0o600 }))).toBe('ENOENT');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('refuses to replace a directory, leaving it in place', async () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, 'taken'));
    // Linux says EISDIR; Windows refuses the rename with EPERM.
    expect(['EISDIR', 'EACCES']).toContain(await codeOf(fs.writeFileAtomic(path.join(dir, 'taken'), new Uint8Array(), { mode: 0o600 })));
    expect(readdirSync(dir)).toEqual(['taken']);
  });
});

describe('NodeFileSystem.rename', () => {
  it('moves a file over another, replacing it', async () => {
    const dir = tempDir();
    const from = file(dir, 'session.json', 'new');
    const to = file(dir, 'session.json.1', 'old');
    await fs.rename(from, to);
    expect(readFileSync(to, 'utf8')).toBe('new');
    expect(readdirSync(dir)).toEqual(['session.json.1']);
  });

  it('refuses a missing file', async () => {
    const dir = tempDir();
    expect(await codeOf(fs.rename(path.join(dir, 'no'), path.join(dir, 'x')))).toBe('ENOENT');
  });
});

describe('NodeFileSystem.remove', () => {
  it('removes a folder and everything in it', async () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, 'profile', 'nested'), { recursive: true });
    file(path.join(dir, 'profile'), 'session.json', '{}');
    file(path.join(dir, 'profile', 'nested'), 'x', 'x');
    await fs.remove(path.join(dir, 'profile'));
    expect(readdirSync(dir)).toEqual([]);
  });

  it('does nothing when the path is already gone', async () => {
    const dir = tempDir();
    await fs.remove(path.join(dir, 'no'));
    expect(readdirSync(dir)).toEqual([]);
  });

  it.runIf(posix)('removes a symlink inside, never what it points at', async () => {
    const dir = tempDir();
    const outside = file(dir, 'keep.md', 'mine');
    mkdirSync(path.join(dir, 'profile'));
    symlinkSync(dir, path.join(dir, 'profile', 'link'));
    await fs.remove(path.join(dir, 'profile'));
    expect(readdirSync(dir)).toEqual(['keep.md']);
    expect(readFileSync(outside, 'utf8')).toBe('mine');
  });
});
