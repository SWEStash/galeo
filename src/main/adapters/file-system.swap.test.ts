import { linkSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { NodeFileSystem } from './file-system';

// Runs between the save's checks and its write: the moment another user could swap the file.
let swap: (() => void) | null = null;
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    access: async (...args: Parameters<typeof actual.access>) => {
      await actual.access(...args);
      swap?.();
      swap = null;
    },
  };
});

describe.runIf(process.platform !== 'win32')('NodeFileSystem.saveFile, file swapped during the save', () => {
  it('refuses to write in place through a symlink swapped in after the checks', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'galeo-swap-'));
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
    const target = path.join(dir, 'shared.md');
    writeFileSync(target, 'old');
    // A hard link sends the save down the in-place path.
    linkSync(target, path.join(dir, 'other-name.md'));
    const victim = path.join(dir, 'authorized_keys');
    writeFileSync(victim, 'keep me');
    swap = () => {
      renameSync(target, path.join(dir, 'moved.md'));
      symlinkSync(victim, target);
    };

    await expect(new NodeFileSystem().saveFile(target, new TextEncoder().encode('new'))).rejects.toThrow();
    expect(readFileSync(victim, 'utf8')).toBe('keep me');
  });

  it('refuses to write in place over another file swapped in after the checks', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'galeo-swap-'));
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
    const target = path.join(dir, 'shared.md');
    writeFileSync(target, 'old');
    linkSync(target, path.join(dir, 'other-name.md'));
    swap = () => {
      renameSync(target, path.join(dir, 'moved.md'));
      writeFileSync(target, 'theirs');
    };

    await expect(new NodeFileSystem().saveFile(target, new TextEncoder().encode('new'))).rejects.toThrow();
    expect(readFileSync(target, 'utf8')).toBe('theirs');
  });
});
