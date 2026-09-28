import { describe, expect, it } from 'vitest';
import type { Parse } from '../../../src/core/settings/json-file';
import type { SessionFile } from '../../../src/core/session/model';
import { SessionStore } from '../../../src/core/session/store';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';

const DIR = '/state/profiles/default';
const FILE = `${DIR}/session.json`;

const parse: Parse<SessionFile> = (data) => {
  const { schemaVersion: _v, ...rest } = data as Record<string, unknown>;
  return Array.isArray(rest['windows']) ? { ok: true, value: rest as unknown as SessionFile } : { ok: false, detail: 'windows' };
};

const session = (savedAt: number, paths: string[] = ['/d/a.md']): SessionFile => ({
  savedAt,
  focusOrder: [0],
  windows: [{ bounds: null, active: 0, tabs: paths.map((path) => ({ entries: [{ path, anchor: null }], index: 0 })) }],
});

function setup(files: Record<string, string> = {}) {
  const fs = new FakeFileSystem(files);
  const store = new SessionStore({ fs, utf8, dir: DIR, parse });
  return { fs, store };
}

const json = (file: SessionFile) => JSON.stringify({ schemaVersion: 1, ...file });
const read = async (fs: FakeFileSystem, path: string) => JSON.parse(new TextDecoder().decode(await fs.readFile(path, { maxBytes: 1e6 })));

describe('SessionStore (ADR-005, SR-17)', () => {
  it('has no session the first time', async () => {
    expect(await setup().store.load()).toEqual({ session: null, notice: null });
  });

  it('loads the saved session', async () => {
    const { store } = setup({ [FILE]: json(session(5)) });
    expect(await store.load()).toEqual({ session: session(5), notice: null });
  });

  it('writes owner-only, and rotates the previous file into .1 to .3 on the first save of a run only', async () => {
    const { fs, store } = setup({ [FILE]: json(session(3)), [`${FILE}.1`]: json(session(2)), [`${FILE}.2`]: json(session(1)), [`${FILE}.3`]: json(session(0)) });
    await store.save(session(10));
    await store.save(session(11));
    expect((await read(fs, FILE)).savedAt).toBe(11);
    expect([(await read(fs, `${FILE}.1`)).savedAt, (await read(fs, `${FILE}.2`)).savedAt, (await read(fs, `${FILE}.3`)).savedAt]).toEqual([3, 2, 1]);
    expect(fs.modeOf(FILE)).toBe(0o600);
    expect(fs.modeOf(DIR)).toBe(0o700);
  });

  it('backs up an invalid session, then restores the newest valid snapshot, with a notice', async () => {
    const { fs, store } = setup({ [FILE]: '{"windows": nope', [`${FILE}.1`]: '[]', [`${FILE}.2`]: json(session(2)), [`${FILE}.3`]: json(session(1)) });
    const loaded = await store.load();
    expect(loaded.session).toEqual(session(2));
    expect(loaded.notice).toMatchObject({ path: FILE, reason: 'invalid' });
    expect(new TextDecoder().decode(await fs.readFile(`${FILE}.invalid`, { maxBytes: 100 }))).toBe('{"windows": nope');
    await expect(fs.stat(FILE)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('starts empty, with a notice, when no file is valid', async () => {
    const { store } = setup({ [FILE]: '{' });
    expect(await store.load()).toMatchObject({ session: null, notice: { reason: 'invalid' } });
  });

  it('lists the valid previous sessions, newest first, and reads one', async () => {
    const { store } = setup({ [`${FILE}.1`]: json(session(2, ['/d/a.md', '/d/b.md'])), [`${FILE}.2`]: 'broken', [`${FILE}.3`]: json(session(1)) });
    expect(await store.previous()).toEqual([
      { snapshot: 1, savedAt: 2, windows: 1, tabs: 2 },
      { snapshot: 3, savedAt: 1, windows: 1, tabs: 1 },
    ]);
    expect(await store.readPrevious(3)).toEqual(session(1));
    expect(await store.readPrevious(2)).toBeNull();
  });
});
