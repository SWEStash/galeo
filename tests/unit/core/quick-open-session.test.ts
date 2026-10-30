import { describe, expect, it } from 'vitest';
import { SelectionGrants } from '../../../src/core/documents/selections';
import { QuickOpen, typedFolder } from '../../../src/core/quick-open/session';
import type { QuickOpenResults } from '../../../src/shared/quick-open';
import { FakeClock, FakeFileSystem } from '../../helpers/fakes';

function counterIds() {
  let n = 0;
  return () => `pick-${++n}`;
}

const HOME = '/home/me';

function setup(files: Record<string, string> = {}, exclude: string[] = []) {
  const fs = new FakeFileSystem({
    [`${HOME}/git/acme/.git/HEAD`]: '',
    [`${HOME}/git/acme/README.md`]: '',
    [`${HOME}/git/acme/.local/plans/plan.md`]: '',
    [`${HOME}/git/acme/docs/plan-old.md`]: '',
    [`${HOME}/git/acme/node_modules/x/plan.md`]: '',
    [`${HOME}/notes/today.md`]: '',
    [`${HOME}/notes/week/monday.md`]: '',
    ...files,
  });
  const updates: QuickOpenResults[] = [];
  const grants = new SelectionGrants(counterIds());
  const quickOpen = new QuickOpen({ fs, clock: new FakeClock(), grants, home: HOME, onUpdate: (_window, results) => updates.push(results) });
  const start = (options: Partial<Parameters<QuickOpen['start']>[1]> = {}) =>
    quickOpen.start(1, { active: `${HOME}/git/acme/docs/plan-old.md`, tabs: [`${HOME}/git/acme/docs/plan-old.md`], recent: [`${HOME}/notes/today.md`], exclude, ...options });
  return { fs, grants, quickOpen, updates, start };
}

const names = (results: QuickOpenResults, kind: string) => results.sections.find((section) => section.kind === kind)?.entries.map((entry) => entry.name) ?? [];

describe('QuickOpen', () => {
  it('searches the git root of the shown file, named in its section', async () => {
    const { quickOpen, start } = setup();
    const { token, scope } = await start();
    expect(scope).toBe('acme (git root)');
    await quickOpen.walked(token);
    const results = await quickOpen.query(1, token, 'plan');
    expect(names(results, 'repo')).toEqual(['.local/plans/plan.md']);
    expect(results.sections.find((section) => section.kind === 'repo')).toMatchObject({ title: 'In acme (git root)', walking: false });
  });

  it('searches the shown file’s folder when it is in no repository, and nothing without a shown file', async () => {
    const { quickOpen, start } = setup();
    const outside = await start({ active: `${HOME}/notes/today.md` });
    expect(outside.scope).toBe('notes');
    await quickOpen.walked(outside.token);
    expect(names(await quickOpen.query(1, outside.token, 'mon'), 'repo')).toEqual(['week/monday.md']);
    const none = await start({ active: null });
    expect(none.scope).toBeNull();
    expect((await quickOpen.query(1, none.token, 'plan')).sections.map((section) => section.kind)).not.toContain('repo');
  });

  it('searches a dropped folder itself, even inside a repository', async () => {
    const { quickOpen, start } = setup();
    const { token, scope } = await start({ folder: `${HOME}/git/acme/.local` });
    expect(scope).toBe('.local');
    await quickOpen.walked(token);
    expect(names(await quickOpen.query(1, token, 'plan'), 'repo')).toEqual(['plans/plan.md']);
  });

  it('shows the open tabs and the recent files for an empty query, each file once, folders as ~/…', async () => {
    const { quickOpen, start } = setup();
    const { token } = await start({ recent: [`${HOME}/notes/today.md`, `${HOME}/git/acme/docs/plan-old.md`] });
    const results = await quickOpen.query(1, token, '');
    expect(results.sections.map((section) => [section.kind, section.entries.map((entry) => [entry.name, entry.detail])])).toEqual([
      ['tabs', [['plan-old.md', '~/git/acme/docs']]],
      ['recent', [['today.md', '~/notes']]],
    ]);
  });

  it('lists a tab or recent file only when the query reaches its name, not for letters spread over its folders', async () => {
    const { quickOpen, start } = setup();
    const scattered = '/srv/RUNNER/Local/Temps/README.md';
    const { token } = await start({ tabs: [scattered, `${HOME}/git/acme/docs/plan-old.md`], recent: [] });
    expect(names(await quickOpen.query(1, token, 'notes'), 'tabs')).toEqual([]);
    expect(names(await quickOpen.query(1, token, 'rme'), 'tabs')).toEqual(['README.md']);
    expect(names(await quickOpen.query(1, token, 'docs/old'), 'tabs')).toEqual(['plan-old.md']);
  });

  it('skips the settings’ extra names as well as the built-in ones', async () => {
    const { quickOpen, start } = setup({ [`${HOME}/git/acme/vendor/plan.md`]: '' }, ['vendor']);
    const { token } = await start();
    await quickOpen.walked(token);
    expect(names(await quickOpen.query(1, token, 'plan'), 'repo')).toEqual(['.local/plans/plan.md']);
  });

  it('opens by the id main offered for the last results only, and never after closing', async () => {
    const { quickOpen, start } = setup();
    const { token } = await start();
    await quickOpen.walked(token);
    const entry = (await quickOpen.query(1, token, 'plan')).sections.find((section) => section.kind === 'repo')!.entries[0]!;
    expect(quickOpen.choose(1, token, entry.id)).toBe(`${HOME}/git/acme/.local/plans/plan.md`);
    expect(quickOpen.choose(1, token, '/etc/passwd')).toBeNull();
    expect(quickOpen.choose(2, token, entry.id)).toBeNull();
    expect(quickOpen.choose(1, 'another-token', entry.id)).toBeNull();
    quickOpen.close(1, token);
    expect(quickOpen.choose(1, token, entry.id)).toBeNull();
  });

  it('streams repository results for the current query while the walk goes on', async () => {
    const tree: Record<string, string> = {};
    for (let n = 0; n < 1200; n++) tree[`${HOME}/big/.git/x${n}`] = '';
    for (let n = 0; n < 1200; n++) tree[`${HOME}/big/d${n % 3}/plan-${n}.md`] = '';
    const { quickOpen, start, updates } = setup(tree);
    const { token } = await start({ active: `${HOME}/big/d0/plan-0.md` });
    void quickOpen.query(1, token, 'plan');
    await quickOpen.walked(token);
    const repo = updates.map((update) => update.sections.find((section) => section.kind === 'repo')!);
    expect(repo.length).toBeGreaterThan(1);
    expect(repo.at(-1)).toMatchObject({ walking: false });
    expect(repo.at(-1)!.entries).toHaveLength(50);
  });

  it('lists a typed folder, ~/ or absolute, filtered by what follows its last slash', async () => {
    const { quickOpen, start } = setup();
    const { token } = await start();
    const home = await quickOpen.query(1, token, '~/notes/');
    expect(home.sections.find((section) => section.kind === 'path')!.entries.map((entry) => [entry.name, entry.folder ?? false])).toEqual([
      ['today.md', false],
      ['week/', true],
    ]);
    const absolute = await quickOpen.query(1, token, `${HOME}/notes/tod`);
    expect(names(absolute, 'path')).toEqual(['today.md']);
    const folder = home.sections.find((section) => section.kind === 'path')!.entries[1]!;
    expect(folder.fill).toBe('~/notes/week/');
    expect(quickOpen.choose(1, token, folder.id)).toBeNull();
    expect(names(await quickOpen.query(1, token, '~/nowhere/'), 'path')).toEqual([]);
  });

  it('gives every result the path Tab fills in, as shown (~/… or absolute), and no other path', async () => {
    const { quickOpen, start } = setup({ '/srv/plan-x.md': '' });
    const { token } = await start({ recent: ['/srv/plan-x.md'] });
    await quickOpen.walked(token);
    const fills = (results: QuickOpenResults) =>
      results.sections.flatMap((section) => section.entries.map((entry) => [section.kind, entry.fill, 'path' in entry]));
    expect(fills(await quickOpen.query(1, token, 'plan'))).toEqual([
      ['tabs', '~/git/acme/docs/plan-old.md', false],
      ['recent', '/srv/plan-x.md', false],
      ['repo', '~/git/acme/.local/plans/plan.md', false],
    ]);
    expect(fills(await quickOpen.query(1, token, '~/notes/'))).toEqual([
      ['path', '~/notes/today.md', false],
      ['path', '~/notes/week/', false],
    ]);
    expect(fills(await quickOpen.query(1, token, `${HOME}/notes/tod`))).toEqual([['path', `${HOME}/notes/today.md`, false]]);
  });

  it('keeps offering the latest query’s files when an earlier listing finishes after it', async () => {
    const { fs, quickOpen, start } = setup();
    const { token } = await start();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const readDir = fs.readDir.bind(fs);
    fs.readDir = async function* (folder: string) {
      if (folder === `${HOME}/notes`) await held;
      yield* readDir(folder);
    };
    const earlier = quickOpen.query(1, token, '~/notes/w');
    const latest = await quickOpen.query(1, token, '~/notes/week/');
    release();
    expect((await earlier).sections).toEqual([]);
    const monday = latest.sections.find((section) => section.kind === 'path')!.entries.find((entry) => entry.name === 'monday.md')!;
    expect(quickOpen.choose(1, token, monday.id)).toBe(`${HOME}/notes/week/monday.md`);
  });
});

describe('typedFolder', () => {
  it('reads ~/ and absolute POSIX paths: the folder, and what follows its last slash', () => {
    expect(typedFolder('~/notes/to', HOME)).toEqual({ folder: `${HOME}/notes`, filter: 'to', shown: '~/notes/' });
    expect(typedFolder('/etc/', HOME)).toEqual({ folder: '/etc', filter: '', shown: '/etc/' });
    expect(typedFolder('/', HOME)).toEqual({ folder: '/', filter: '', shown: '/' });
  });

  it('reads Windows paths with either separator, a drive root staying a root', () => {
    const home = 'C:\\Users\\me';
    expect(typedFolder('C:\\Users\\me\\no', home)).toEqual({ folder: 'C:\\Users\\me', filter: 'no', shown: 'C:\\Users\\me\\' });
    expect(typedFolder('D:\\a\\acme/', home)).toEqual({ folder: 'D:\\a\\acme', filter: '', shown: 'D:\\a\\acme/' });
    expect(typedFolder('c:/', home)).toEqual({ folder: 'c:/', filter: '', shown: 'c:/' });
    expect(typedFolder('~\\docs\\', home)).toEqual({ folder: 'C:\\Users\\me\\docs', filter: '', shown: '~\\docs\\' });
  });

  it('leaves anything else to the name search', () => {
    for (const query of ['notes', 'C:notes', '~notes', 'docs/plan']) expect(typedFolder(query, HOME), query).toBeNull();
  });
});
