import { describe, expect, it } from 'vitest';
import { FsError } from '../../../src/core/ports';
import { memoryFiles } from '../../../src/demo/memory-fs';
import { standIn } from '../../../src/demo/stand-in';
import type { DocumentContent, Events } from '../../../src/shared/contracts/ipc';

const PLAN = '/home/demo/galeo-demo/plan.md';
const LOG = '/home/demo/galeo-demo/server.log';
const FILES = { [PLAN]: '# Plan\n\n- [ ] ship the demo\n', [LOG]: 'started\n' };

const ctrlE = { key: 'e', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function demo() {
  const files = memoryFiles(FILES, () => 1);
  const { api, keyDown, changed } = standIn(files, [PLAN, LOG]);
  const heard: Partial<{ [E in keyof Events]: Events[E][] }> = {};
  const hear = <E extends keyof Events>(event: E) => (payload: Events[E]) => void (heard[event] = [...(heard[event] ?? []), payload] as never);
  api.tabs.onChanged(hear('tabs.changed'));
  api.tabs.onStale(hear('tabs.stale'));
  api.documents.onEditMode(hear('documents.editMode'));
  api.settings.onChanged(hear('settings.changed'));
  return { files, api, keyDown, changed, heard };
}

const ready = (content: unknown) => content as Extract<DocumentContent, { state: 'ready' }>;

describe('memoryFiles (the demo)', () => {
  it('reads, refuses what is too big, missing or a folder, and saves', async () => {
    const files = memoryFiles(FILES);
    expect(new TextDecoder().decode(await files.readFile(PLAN, { maxBytes: 100 }))).toBe(FILES[PLAN]);
    await expect(files.readFile(PLAN, { maxBytes: 3 })).rejects.toEqual(new FsError('ETOOBIG', PLAN));
    await expect(files.readFile('/home/demo/none.md', { maxBytes: 100 })).rejects.toEqual(new FsError('ENOENT', '/home/demo/none.md'));
    await expect(files.readFile('/home/demo/galeo-demo', { maxBytes: 100 })).rejects.toEqual(new FsError('EISDIR', '/home/demo/galeo-demo'));
    expect(await files.saveFile(PLAN, new TextEncoder().encode('new'))).toBe('replaced');
    expect(await files.saveFile('/home/demo/galeo-demo/b.md', new TextEncoder().encode('b'))).toBe('created');
    const names = [];
    for await (const entry of files.readDir('/home/demo')) names.push(entry);
    expect(names).toEqual([{ name: 'galeo-demo', kind: 'directory' }]);
  });

  it('grows a file at its end', async () => {
    const files = memoryFiles(FILES);
    files.append(LOG, 'ready\n');
    expect(new TextDecoder().decode(await files.readFile(LOG, { maxBytes: 100 }))).toBe('started\nready\n');
  });
});

describe('standIn (the demo)', () => {
  it('opens the files as tabs, the first shown, with their formats and folders', async () => {
    const { api } = demo();
    const snapshot = await api.tabs.snapshot();
    expect(snapshot.tabs.map(({ path, format, folder }) => ({ path, format, folder }))).toEqual([
      { path: PLAN, format: 'markdown', folder: '~/galeo-demo' },
      { path: LOG, format: 'log', folder: '~/galeo-demo' },
    ]);
    expect(snapshot.active).toBe(snapshot.tabs[0]!.id);
    const content = ready(await api.documents.read(snapshot.tabs[0]!.id, null));
    expect(content).toMatchObject({ state: 'ready', format: 'markdown', view: 'rendered', text: FILES[PLAN] });
    await expect(api.documents.read('demo-99', null)).rejects.toThrow('unknown document');
  });

  it('closes, reopens, pins and searches tabs as the app does, telling the page each time', async () => {
    const { api, heard } = demo();
    const [plan, log] = (await api.tabs.snapshot()).tabs;
    await api.tabs.close(plan!.id);
    await settle();
    expect(heard['tabs.changed']!.at(-1)!.tabs.map((tab) => tab.id)).toEqual([log!.id]);
    expect((await api.tabs.search('plan')).closed.map((hit) => hit.name)).toEqual(['plan.md']);
    const reopened = await api.tabs.reopenClosed();
    await api.tabs.pin(log!.id, true);
    await settle();
    expect(heard['tabs.changed']!.at(-1)!.tabs.map((tab) => [tab.id, tab.path, tab.pinned ?? false])).toEqual([
      [log!.id, LOG, true],
      [reopened, PLAN, false],
    ]);
  });

  it('saves only after Ctrl+E granted edit mode, in memory, and refuses a stale version', async () => {
    const { api, keyDown, files, heard } = demo();
    const plan = (await api.tabs.snapshot()).tabs[0]!;
    const { version } = ready(await api.documents.read(plan.id, null));
    expect(await api.documents.save(plan.id, '# Edited\n', version)).toEqual({ kind: 'refused', reason: 'not-editable' });
    expect(keyDown(ctrlE)).toBe(true);
    expect(heard['documents.editMode']).toEqual([{ id: plan.id, edit: 'granted' }]);
    const saved = await api.documents.save(plan.id, '# Edited\n', version);
    expect(saved.kind).toBe('saved');
    expect(new TextDecoder().decode(await files.readFile(PLAN, { maxBytes: 100 }))).toBe('# Edited\n');
    expect((await api.documents.save(plan.id, 'again', version)).kind).toBe('conflict');
    keyDown(ctrlE);
    expect(heard['documents.editMode']!.at(-1)).toEqual({ id: plan.id, edit: 'leave' });
    expect(keyDown({ ...ctrlE, key: 'w' })).toBe(false);
  });

  it('refuses Ctrl+E on a tab it has not read as text', async () => {
    const { keyDown, heard } = demo();
    keyDown(ctrlE);
    expect(heard['documents.editMode']![0]!.edit).toBe('refused');
  });

  it('ticks a task box in the file', async () => {
    const { api, files } = demo();
    const plan = (await api.tabs.snapshot()).tabs[0]!;
    const { version } = ready(await api.documents.read(plan.id, null));
    expect((await api.documents.toggleTask(plan.id, 3, version)).kind).toBe('saved');
    expect(new TextDecoder().decode(await files.readFile(PLAN, { maxBytes: 100 }))).toContain('- [x] ship the demo');
  });

  it('finds text in every tab', async () => {
    const { api } = demo();
    const found = await api.documents.findAll('demo', { caseSensitive: false });
    expect(found.kind === 'done' && found.tabs.map((tab) => ('found' in tab ? tab.found.count : tab.skipped))).toEqual([1]);
  });

  it('keeps settings in memory and tells the page', async () => {
    const { api, heard } = demo();
    await api.settings.set('global', { themeMode: 'dark' });
    expect((await api.settings.get()).settings.themeMode).toBe('dark');
    expect(heard['settings.changed']!.at(-1)!.sources.themeMode).toBe('global');
    await api.settings.reset('themeMode');
    expect((await api.settings.get()).settings.themeMode).toBe('system');
  });

  it('tells the tabs showing a file that it changed', async () => {
    const { api, changed, heard, files } = demo();
    const log = (await api.tabs.snapshot()).tabs[1]!;
    files.append(LOG, 'ready\n');
    changed(LOG);
    expect(heard['tabs.stale']).toEqual([log.id]);
    expect(ready(await api.documents.read(log.id, null)).text).toBe('started\nready\n');
  });

  it("says no to what only the app can do: files, windows, profiles, PDF, launchers", async () => {
    const said: string[] = [];
    const { api } = standIn(memoryFiles(FILES), [PLAN, LOG], (message) => said.push(message));
    const plan = (await api.tabs.snapshot()).tabs[0]!;
    expect(await api.documents.exportPdf(plan.id)).toBeNull();
    expect(await api.tabs.moveTo(plan.id, 'new')).toBe(false);
    expect(await api.tabs.windows()).toEqual([]);
    expect(await api.recent.list()).toEqual([]);
    expect(await api.watch.state()).toBeNull();
    expect((await api.app.installLauncher()).ok).toBe(false);
    expect((await api.profiles.create('Work', null)).ok).toBe(false);
    await api.window.command('newWindow');
    expect(said).toEqual(['Export to PDF needs the app.', 'Moving tabs between windows needs the app.', 'Profiles need the app.', 'Windows need the app: the demo is one page.']);
  });
});
