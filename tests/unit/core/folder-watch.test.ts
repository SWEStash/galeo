import { describe, expect, it } from 'vitest';
import { FolderWatch, WATCH_LIMITS } from '../../../src/core/watch/folder';
import { FakeClock, FakeFileSystem, FakeFileWatcher } from '../../helpers/fakes';

/** Lets the watch's file-system calls (promises) run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

async function setup(files: Record<string, string> = {}, options: { limits?: { entries?: number; folders?: number }; exclude?: string[]; before?: (fs: FakeFileSystem, watcher: FakeFileWatcher) => void } = {}) {
  const clock = new FakeClock(1_000);
  const fs = new FakeFileSystem({ '/w/.keep.md': '', ...files });
  const watcher = new FakeFileWatcher();
  options.before?.(fs, watcher);
  let changes = 0;
  const watch = new FolderWatch('/w', { fs, watcher, clock, exclude: options.exclude ?? [], onChange: () => changes++, ...(options.limits ? { limits: options.limits } : {}) });
  await watch.start();
  /** Writes `path` and tells its folder's watch, as the system would. */
  const write = async (path: string, content = 'x') => {
    fs.write(path, content);
    const slash = path.lastIndexOf('/');
    watcher.emitFolder(path.slice(0, slash), { kind: 'entry', name: path.slice(slash + 1) });
  };
  const settle = async (ms = 300) => {
    clock.advance(ms);
    await flush();
  };
  const names = () => watch.state().entries.map((entry) => `${entry.folder ? `${entry.folder}/` : ''}${entry.name}:${entry.kind}${entry.opened ? ':opened' : ''}`);
  return { clock, fs, watcher, watch, write, settle, names, changes: () => changes };
}

describe('FolderWatch', () => {
  it('lists a file created after the start as new and one that was there as changed, newest first', async () => {
    const { write, settle, names, watch } = await setup({ '/w/old.md': '# old' });
    expect(watch.state()).toMatchObject({ status: 'watching', polling: false, entries: [], truncated: false });
    await write('/w/report.md');
    await settle();
    await write('/w/old.md', '# old, edited');
    await settle();
    expect(names()).toEqual(['old.md:changed', 'report.md:new']);
    expect(watch.state().entries[0]).toMatchObject({ path: '/w/old.md', folder: '', at: 1_600 });
  });

  it('makes one entry of a burst of writes, and of a temporary file renamed over the target', async () => {
    const { write, settle, names, fs, watcher } = await setup();
    for (let i = 0; i < 10; i++) await write('/w/stream.log', 'x'.repeat(i + 1));
    fs.write('/w/r.md.tmp', 'r');
    watcher.emitFolder('/w', { kind: 'entry', name: 'r.md.tmp' });
    await fs.rename('/w/r.md.tmp', '/w/r.md');
    watcher.emitFolder('/w', { kind: 'entry', name: 'r.md.tmp' });
    watcher.emitFolder('/w', { kind: 'entry', name: 'r.md' });
    await settle(1_000);
    expect(names().sort()).toEqual(['r.md:new', 'stream.log:new']);
  });

  it('leaves out types galeo does not open, skipped folders and deleted files', async () => {
    const { write, settle, names, fs, watcher } = await setup({}, { exclude: ['private'] });
    await write('/w/photo.png');
    await write('/w/node_modules/x/readme.md');
    watcher.emitFolder('/w', { kind: 'entry', name: 'node_modules' });
    await write('/w/private/notes.md');
    watcher.emitFolder('/w', { kind: 'entry', name: 'private' });
    await write('/w/gone.md');
    fs.delete('/w/gone.md');
    await settle();
    expect(names()).toEqual([]);
    expect(watcher.watchedFolders()).toEqual(['/w']);
  });

  it('watches subfolders to 4 levels and lists their files with their folder', async () => {
    const { write, settle, names, watcher } = await setup({ '/w/a/b/c/d/e/deep.md': '', '/w/a/b/c/d/four.md': '' });
    expect(watcher.watchedFolders()).toEqual(['/w', '/w/a', '/w/a/b', '/w/a/b/c', '/w/a/b/c/d']);
    await write('/w/a/b/c/d/four.md', 'changed');
    await settle();
    expect(names()).toEqual(['a/b/c/d/four.md:changed']);
    expect(watcher.watchedFolders()).not.toContain('/w/a/b/c/d/e');
  });

  it('never lists a file whose real path leaves the folder, nor enters a symlinked folder', async () => {
    const { settle, names, watcher, fs } = await setup(
      { '/elsewhere/secret.md': 's', '/elsewhere/dir/inner.md': 'i' },
      {
        before: (fs) => {
          fs.symlink('/w/link.md', '/elsewhere/secret.md');
          fs.symlink('/w/linked', '/elsewhere/dir');
        },
      },
    );
    expect(watcher.watchedFolders()).toEqual(['/w']);
    fs.write('/elsewhere/secret.md', 'changed');
    watcher.emitFolder('/w', { kind: 'entry', name: 'link.md' });
    watcher.emitFolder('/w', { kind: 'entry', name: 'linked' });
    await settle();
    expect(names()).toEqual([]);
    expect(watcher.watchedFolders()).toEqual(['/w']);
  });

  it('checks an entry again when it is opened: one swapped for a link out of the folder is not', async () => {
    const { write, settle, watch, fs } = await setup({ '/elsewhere/secret.md': 's' });
    await write('/w/a.md');
    await write('/w/b.md');
    await settle();
    expect(await watch.stillInside('/w/a.md')).toBe(true);
    // Whoever writes into the folder swaps the file between the listing and the click.
    fs.symlink('/w/a.md', '/elsewhere/secret.md');
    expect(await watch.stillInside('/w/a.md')).toBe(false);
    expect(await watch.stillInside('/w/gone.md')).toBe(false);
    expect(await watch.stillInside('/w/b.md')).toBe(true);
  });

  it("takes only its own separator, and a folder at the file system's root", async () => {
    const { write, settle, names, watcher } = await setup(
      { '/w\\x/s.md': 's' },
      { before: (fs) => fs.symlink('/w/l.md', '/w\\x/s.md') },
    );
    watcher.emitFolder('/w', { kind: 'entry', name: 'l.md' });
    await write('/w/ok.md');
    await settle();
    expect(names()).toEqual(['ok.md:new']);

    // A root already ends with its separator: what is under it is inside.
    const root = new FolderWatch('/', { fs: new FakeFileSystem({ '/b.md': 'b' }), watcher: new FakeFileWatcher(), clock: new FakeClock(1_000), exclude: [], onChange: () => {} });
    expect(await root.stillInside('/b.md')).toBe(true);
  });

  it('watches a folder created after the start, and its files are new', async () => {
    const { settle, names, watcher, fs } = await setup();
    fs.write('/w/reports/2026/review.md', '# r');
    fs.write('/w/reports/summary.md', '# s');
    watcher.emitFolder('/w', { kind: 'entry', name: 'reports' });
    await settle();
    expect(watcher.watchedFolders()).toEqual(['/w', '/w/reports', '/w/reports/2026']);
    expect(names().sort()).toEqual(['reports/2026/review.md:new', 'reports/summary.md:new']);
  });

  it('keeps the newest entries past the limit and says so', async () => {
    const { write, settle, names, watch } = await setup({}, { limits: { entries: 3 } });
    for (const name of ['a', 'b', 'c', 'd']) {
      await write(`/w/${name}.md`);
      await settle();
    }
    expect(names()).toEqual(['d.md:new', 'c.md:new', 'b.md:new']);
    expect(watch.state().truncated).toBe(true);
  });

  it('marks an entry opened; a later change makes it changed again; open all new takes the oldest first', async () => {
    const { write, settle, names, watch } = await setup();
    await write('/w/a.md');
    await settle();
    await write('/w/b.md');
    await settle();
    await write('/w/c.md');
    await settle();
    watch.markOpened('/w/b.md');
    expect(names()).toEqual(['c.md:new', 'b.md:new:opened', 'a.md:new']);
    expect(watch.unopened()).toEqual(['/w/a.md', '/w/c.md']);
    await write('/w/b.md', 'again');
    await settle();
    expect(names()).toEqual(['b.md:changed', 'c.md:new', 'a.md:new']);
    await write('/w/c.md', 'again');
    await settle();
    expect(names()[0]).toBe('c.md:new');
  });

  it('polls the folders past the watch limit, and those that cannot be watched', async () => {
    const { settle, names, watch, fs, watcher } = await setup(
      { '/w/a/one.md': '1', '/w/b/two.md': '2', '/w/c/three.md': '3' },
      { limits: { folders: 2 }, before: (_fs, watcher) => watcher.unwatchable.add('/w/b') },
    );
    expect(watcher.watchedFolders()).toEqual(['/w', '/w/a']);
    expect(watch.state().polling).toBe(true);
    fs.write('/w/b/two.md', '22');
    fs.write('/w/c/three.md', '33');
    fs.write('/w/c/new.md', 'n');
    await settle(WATCH_LIMITS.pollMs);
    expect(names().sort()).toEqual(['b/two.md:changed', 'c/new.md:new', 'c/three.md:changed']);
  });

  it('shows a folder that went away as missing, keeps the list, and watches again once it is back', async () => {
    const { write, settle, names, watch, fs, watcher } = await setup();
    await write('/w/a.md');
    await settle();
    await fs.remove('/w');
    watcher.emitFolder('/w', { kind: 'lost' });
    await flush();
    expect(watch.state().status).toBe('missing');
    expect(watcher.watchedFolders()).toEqual([]);
    expect(names()).toEqual(['a.md:new']);
    await settle(WATCH_LIMITS.pollMs);
    expect(watch.state().status).toBe('missing');
    fs.write('/w/b.md', 'b');
    await settle(WATCH_LIMITS.pollMs);
    expect(watch.state().status).toBe('watching');
    expect(watcher.watchedFolders()).toEqual(['/w']);
    await write('/w/c.md');
    await settle();
    expect(names()).toEqual(['c.md:new', 'a.md:new']);
  });

  it('starts as missing for a folder that is not there, and as denied for one it may not read', async () => {
    const missing = new FolderWatch('/nowhere', { fs: new FakeFileSystem(), watcher: new FakeFileWatcher(), clock: new FakeClock(), exclude: [], onChange: () => {} });
    await missing.start();
    expect(missing.state().status).toBe('missing');
    missing.stop();
    const { watch } = await setup({}, { before: (fs) => fs.failWith('/w', 'EACCES') });
    expect(watch.state().status).toBe('denied');
    watch.stop();
  });

  it('drops every watch on stop and reports nothing after', async () => {
    const { write, settle, watch, watcher, changes } = await setup({ '/w/a/x.md': '' });
    watch.stop();
    expect(watcher.watchedFolders()).toEqual([]);
    const before = changes();
    await write('/w/new.md');
    await settle(WATCH_LIMITS.pollMs);
    expect(changes()).toBe(before);
    expect(watch.state().entries).toEqual([]);
  });

  it('classifies what arrived during the first walk once it knows what was there', async () => {
    const clock = new FakeClock(0);
    const fs = new FakeFileSystem({ '/w/old.md': '' });
    const watcher = new FakeFileWatcher();
    // The root's listing holds until released, so events arrive while the walk runs.
    let listed!: () => void;
    const hold = new Promise<void>((resolve) => (listed = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const gated = {
      stat: fs.stat.bind(fs),
      realpath: fs.realpath.bind(fs),
      async *readDir(path: string) {
        yield* fs.readDir(path);
        listed();
        await gate;
      },
    };
    const watch = new FolderWatch('/w', { fs: gated, watcher, clock, exclude: [], onChange: () => {} });
    const started = watch.start();
    await hold;
    fs.write('/w/new.md', 'n');
    watcher.emitFolder('/w', { kind: 'entry', name: 'new.md' });
    watcher.emitFolder('/w', { kind: 'entry', name: 'old.md' });
    expect(watch.state().status).toBe('starting');
    release();
    await started;
    await flush();
    expect(watch.state().entries.map((entry) => `${entry.name}:${entry.kind}`).sort()).toEqual(['new.md:new', 'old.md:changed']);
  });
});
