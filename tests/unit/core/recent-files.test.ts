import { describe, expect, it } from 'vitest';
import { RecentFiles, type RecentFile } from '../../../src/core/session/recent';
import type { Parse } from '../../../src/core/settings/json-file';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';

const PATH = '/state/profiles/default/recent.json';
const parse: Parse<{ files: RecentFile[] }> = (data) => ({ ok: true, value: data as { files: RecentFile[] } });

function setup(files: Record<string, string> = {}) {
  const fs = new FakeFileSystem(files);
  let now = 1000;
  const recent = new RecentFiles({ fs, utf8, path: PATH, parse, now: () => now++ });
  return { fs, recent };
}

const saved = async (fs: FakeFileSystem) => JSON.parse(new TextDecoder().decode(await fs.readFile(PATH, { maxBytes: 1e6 })));

describe('RecentFiles (ADR-005, SR-16)', () => {
  it('keeps opened files newest first, once each, as paths only, owner-only', async () => {
    const { fs, recent } = setup({ '/d/a.md': 'secret text', '/d/b.md': 'b' });
    await recent.load();
    await recent.add('/d/a.md');
    await recent.add('/d/b.md');
    await recent.add('/d/a.md');
    expect(recent.list().map((file) => file.path)).toEqual(['/d/a.md', '/d/b.md']);
    const file = await saved(fs);
    expect(file).toEqual({ schemaVersion: 1, files: [{ path: '/d/a.md', openedAt: 1002 }, { path: '/d/b.md', openedAt: 1001 }] });
    expect(JSON.stringify(file)).not.toContain('secret');
    expect(fs.modeOf(PATH)).toBe(0o600);
  });

  it('keeps at most 200', async () => {
    const { recent } = setup();
    for (let n = 0; n < 205; n++) await recent.add(`/d/${n}.md`);
    expect(recent.list()).toHaveLength(200);
    expect(recent.list()[0]!.path).toBe('/d/204.md');
  });

  it('drops files that no longer exist when it loads', async () => {
    const stored = JSON.stringify({ schemaVersion: 1, files: [{ path: '/d/gone.md', openedAt: 2 }, { path: '/d/here.md', openedAt: 1 }] });
    const { recent } = setup({ [PATH]: stored, '/d/here.md': 'x' });
    await recent.load();
    expect(recent.list().map((file) => file.path)).toEqual(['/d/here.md']);
  });

  it('clears the list, on disk too', async () => {
    const { fs, recent } = setup();
    await recent.add('/d/a.md');
    await recent.clear();
    expect(recent.list()).toEqual([]);
    expect((await saved(fs)).files).toEqual([]);
  });

  it('starts empty from an invalid file, without failing', async () => {
    const { recent } = setup({ [PATH]: '{' });
    await recent.load();
    expect(recent.list()).toEqual([]);
  });

  it('sets an invalid file aside before writing a new one, so nothing is lost silently', async () => {
    const { fs, recent } = setup({ [PATH]: '{' });
    await recent.load();
    await recent.add('/d/a.md');
    expect(new TextDecoder().decode(await fs.readFile(`${PATH}.invalid`, { maxBytes: 10 }))).toBe('{');
  });

  it('writes one change at a time, keeping every file added', async () => {
    const { fs, recent } = setup();
    await Promise.all([recent.add('/d/a.md'), recent.add('/d/b.md')]);
    expect((await saved(fs)).files.map((file: { path: string }) => file.path)).toEqual(['/d/b.md', '/d/a.md']);
  });

  it('keeps a file added while the list is still loading', async () => {
    const stored = JSON.stringify({ schemaVersion: 1, files: [{ path: '/d/old.md', openedAt: 1 }] });
    const { recent } = setup({ [PATH]: stored, '/d/old.md': 'x' });
    const loading = recent.load();
    const adding = recent.add('/d/new.md');
    await Promise.all([loading, adding]);
    expect(recent.list().map((file) => file.path)).toEqual(['/d/new.md', '/d/old.md']);
  });
});


describe('RecentFiles.idle', () => {
  it('settles once every write asked for so far has landed', async () => {
    const { fs, recent } = setup();
    void recent.add('/d/a.md');
    await recent.idle();
    await expect(fs.stat(PATH)).resolves.toBeDefined();
  });
});
