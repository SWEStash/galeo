import { describe, expect, it } from 'vitest';
import { findGitRoot } from '../../../src/core/quick-open/git-root';
import { BUILT_IN_EXCLUDES, walk, type WalkEnd } from '../../../src/core/quick-open/walker';
import { FsError, type DirEntry, type FileSystem } from '../../../src/core/ports';
import { FakeClock, FakeFileSystem } from '../../helpers/fakes';

async function collect(fs: FileSystem, root: string, options: Partial<Parameters<typeof walk>[2]> = {}) {
  const clock = options.clock ?? new FakeClock();
  const files: string[] = [];
  const batches: number[] = [];
  const walker = walk(fs, root, { clock, ...options });
  let step = await walker.next();
  while (!step.done) {
    files.push(...step.value);
    batches.push(step.value.length);
    step = await walker.next();
  }
  return { files, batches, end: step.value as WalkEnd };
}

describe('findGitRoot', () => {
  it('is the nearest folder with a .git folder or file (a worktree), else null', async () => {
    const fs = new FakeFileSystem({
      '/r/repo/.git/HEAD': 'ref',
      '/r/repo/docs/deep/a.md': '',
      '/r/wt/.git': 'gitdir: /r/repo/.git/worktrees/wt',
      '/r/wt/b.md': '',
      '/r/loose/c.md': '',
    });
    expect(await findGitRoot(fs, '/r/repo/docs/deep')).toBe('/r/repo');
    expect(await findGitRoot(fs, '/r/repo')).toBe('/r/repo');
    expect(await findGitRoot(fs, '/r/wt')).toBe('/r/wt');
    expect(await findGitRoot(fs, '/r/loose')).toBeNull();
  });

  it('climbs a Windows path up to its drive root, and no further', async () => {
    const checked: string[] = [];
    const fs = {
      stat: async (path: string) => {
        checked.push(path);
        if (path === 'C:\\.git') return { kind: 'directory' as const, size: 0, mtimeMs: 0, id: '1:1', executable: false };
        throw new FsError('ENOENT', path);
      },
    };
    expect(await findGitRoot(fs, 'C:\\src\\app')).toBe('C:\\');
    expect(checked).toEqual(['C:\\src\\app\\.git', 'C:\\src\\.git', 'C:\\.git']);
    checked.length = 0;
    expect(await findGitRoot({ stat: async (path) => (checked.push(path), Promise.reject(new FsError('ENOENT', path))) }, 'D:\\x')).toBeNull();
    expect(checked).toEqual(['D:\\x\\.git', 'D:\\.git']);
  });
});

describe('walk', () => {
  it('lists files relative to the root, shallow ones first, dot folders and git-ignored files included', async () => {
    const fs = new FakeFileSystem({
      '/r/README.md': '',
      '/r/.local/plans/plan.md': '',
      '/r/.claude/notes.md': '',
      '/r/docs/a.md': '',
      '/r/.gitignore': '.local/\n',
    });
    const { files, end } = await collect(fs, '/r');
    expect(files).toEqual(['.gitignore', 'README.md', '.claude/notes.md', 'docs/a.md', '.local/plans/plan.md']);
    expect(end).toEqual({ truncated: null });
  });

  it('skips the built-in folders and the extra names at any depth', async () => {
    const fs = new FakeFileSystem({
      '/r/a.md': '',
      '/r/.git/HEAD': '',
      '/r/node_modules/x/readme.md': '',
      '/r/pkg/node_modules/y.md': '',
      '/r/pkg/dist/out.md': '',
      '/r/pkg/src/keep.md': '',
      '/r/vendor/v.md': '',
      '/r/secret.md': '',
    });
    expect(BUILT_IN_EXCLUDES).toEqual(expect.arrayContaining(['.git', 'node_modules', 'dist', 'build', 'out', 'target', 'coverage', '.venv', 'venv', '__pycache__', '.next', '.cache']));
    const { files } = await collect(fs, '/r', { exclude: ['vendor', 'secret.md'] });
    expect(files).toEqual(['a.md', 'pkg/src/keep.md']);
  });

  it('lists symlinked files but never enters symlinked folders, so it cannot leave the root or loop', async () => {
    const fs = new FakeFileSystem({ '/r/AGENTS.md': '', '/r/docs/a.md': '', '/outside/secret.md': '' });
    fs.symlink('/r/CLAUDE.md', '/r/AGENTS.md');
    fs.symlink('/r/escape', '/outside');
    fs.symlink('/r/docs/loop', '/r');
    const { files } = await collect(fs, '/r');
    expect(files).toEqual(['AGENTS.md', 'CLAUDE.md', 'docs/a.md']);
  });

  it('enters each folder once, even when two paths reach it (bind mounts)', async () => {
    const fs = new FakeFileSystem({ '/r/a/x.md': '', '/r/b/y.md': '' });
    const sameFolder = Object.assign(Object.create(fs) as FileSystem, {
      stat: async (path: string) => {
        const stat = await fs.stat(path);
        return path === '/r/b' ? { ...stat, id: (await fs.stat('/r/a')).id } : stat;
      },
    });
    const { files } = await collect(sameFolder, '/r');
    expect(files).toEqual(['a/x.md']);
  });

  it('stops at the file limit, and says so', async () => {
    const tree: Record<string, string> = {};
    for (let n = 0; n < 30; n++) tree[`/r/f${String(n).padStart(2, '0')}.md`] = '';
    const { files, end } = await collect(new FakeFileSystem(tree), '/r', { maxFiles: 25 });
    expect(files).toHaveLength(25);
    expect(end).toEqual({ truncated: 'files' });
  });

  it('does not go deeper than the depth limit, and says so', async () => {
    const fs = new FakeFileSystem({ '/r/a.md': '', '/r/1/b.md': '', '/r/1/2/c.md': '', '/r/1/2/3/d.md': '' });
    const { files, end } = await collect(fs, '/r', { maxDepth: 2 });
    expect(files).toEqual(['a.md', '1/b.md', '1/2/c.md']);
    expect(end).toEqual({ truncated: 'depth' });
  });

  it('stops when its time is up, and says so', async () => {
    const clock = new FakeClock();
    const fs = new FakeFileSystem({ '/r/a/1.md': '', '/r/b/2.md': '', '/r/c/3.md': '' });
    const slow = Object.assign(Object.create(fs) as FileSystem, {
      readDir: (path: string): AsyncIterable<DirEntry> => {
        clock.advance(1_000);
        return fs.readDir(path);
      },
    });
    const { files, end } = await collect(slow, '/r', { clock, budgetMs: 2_500 });
    expect(files.length).toBeLessThan(3);
    expect(end).toEqual({ truncated: 'time' });
  });

  it('yields in batches, so results can stream', async () => {
    const tree: Record<string, string> = {};
    for (let n = 0; n < 250; n++) tree[`/r/d${n % 5}/f${n}.md`] = '';
    const { files, batches } = await collect(new FakeFileSystem(tree), '/r', { batchSize: 100 });
    expect(files).toHaveLength(250);
    expect(batches).toEqual([100, 100, 50]);
  });

  it('skips a folder it may not read, and fails only when the root itself cannot be read', async () => {
    const fs = new FakeFileSystem({ '/r/a.md': '', '/r/locked/b.md': '' });
    fs.failWith('/r/locked', 'EACCES');
    expect((await collect(fs, '/r')).files).toEqual(['a.md']);
    await expect(collect(fs, '/r/locked')).rejects.toBeInstanceOf(FsError);
  });
});
