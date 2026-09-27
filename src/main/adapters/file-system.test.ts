import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
