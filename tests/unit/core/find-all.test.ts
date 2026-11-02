import { describe, expect, it, vi } from 'vitest';
import { EditGrants } from '../../../src/core/documents/edit-grants';
import { TabSearches, findInBytesTask } from '../../../src/core/documents/find-all';
import { TabRegistry } from '../../../src/core/tabs/registry';
import type { Decode } from '../../../src/core/text/decode';
import { findInTextTask } from '../../../src/shared/find';
import { FakeFileSystem, FakeTaskRunner } from '../../helpers/fakes';

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);
const ANY_CASE = { caseSensitive: false };

/** A file system whose reads of `slow` wait until released. */
class SlowFileSystem extends FakeFileSystem {
  readonly reads: string[] = [];
  private waiting: (() => void)[] = [];
  slow = '';
  inFlight = 0;
  mostInFlight = 0;
  override async readFile(file: string, options: { maxBytes: number }): Promise<Uint8Array> {
    this.reads.push(file);
    this.mostInFlight = Math.max(this.mostInFlight, ++this.inFlight);
    try {
      if (file === this.slow) await new Promise<void>((resolve) => this.waiting.push(resolve));
      return await super.readFile(file, options);
    } finally {
      this.inFlight--;
    }
  }
  finishSlowReads() {
    this.slow = '';
    for (const release of this.waiting.splice(0)) release();
  }
}

function setup(files: Record<string, string | Uint8Array>) {
  const fs = new SlowFileSystem(files);
  const grants = new EditGrants();
  const tasks = new FakeTaskRunner({ findInText: findInTextTask, findInBytes: (input) => findInBytesTask(input, decode) });
  let n = 0;
  const records = new TabRegistry(() => `id-${++n}`);
  const searches = new TabSearches({ records, grants, fs, tasks });
  return { fs, grants, tasks, records, searches };
}

const counts = (result: Awaited<ReturnType<TabSearches['search']>>) =>
  result.kind === 'done' ? result.tabs.map((tab) => ('found' in tab ? `${tab.id}:${tab.found.count}` : `${tab.id}:${tab.skipped}`)) : result.kind;

describe('TabSearches', () => {
  it("searches the window's tabs in tab order and lists those with matches", async () => {
    const { records, searches } = setup({ '/d/a.md': 'needle needle', '/d/b.md': 'nothing', '/d/c.log': 'a needle' });
    for (const file of ['/d/a.md', '/d/b.md', '/d/c.log']) records.open(file, 1);
    const result = await searches.search(1, 'needle', ANY_CASE);
    expect(counts(result)).toEqual(['id-1:2', 'id-3:1']);
    expect(result.kind === 'done' && 'found' in result.tabs[0]! && result.tabs[0].found.hits[0]).toMatchObject({ line: 1, match: 'needle' });
  });

  it("never searches the settings tab or another window's tabs", async () => {
    const { fs, records, searches } = setup({ '/d/a.md': 'needle', '/d/b.md': 'needle' });
    records.open('/d/a.md', 1);
    records.openSettings(1);
    records.open('/d/b.md', 2);
    expect(counts(await searches.search(1, 'needle', ANY_CASE))).toEqual(['id-1:1']);
    expect(fs.reads).toEqual(['/d/a.md']);
  });

  it("searches an unsaved tab's kept text, not its file", async () => {
    const { fs, grants, records, searches } = setup({ '/d/a.md': 'old words' });
    const { id } = records.open('/d/a.md', 1);
    grants.grant(id, 1, '/d/a.md');
    grants.keep(id, 1, 'new needle', null);
    expect(counts(await searches.search(1, 'needle', ANY_CASE))).toEqual([`${id}:1`]);
    expect(fs.reads).toEqual([]);
  });

  it("reads a file in the tab's chosen encoding", async () => {
    const { records, searches } = setup({ '/d/a.txt': new Uint8Array([0x63, 0x61, 0x66, 0xe9]) });
    const { id } = records.open('/d/a.txt', 1);
    records.setEncoding(id, 1, 'windows-1252');
    expect(counts(await searches.search(1, 'café', ANY_CASE))).toEqual([`${id}:1`]);
  });

  it("hands a file tab's bytes to the worker without a copy, in the tab's chosen encoding", async () => {
    const { tasks, records, searches } = setup({ '/d/a.txt': 'a needle', '/d/b.md': 'needle' });
    const { id } = records.open('/d/a.txt', 1);
    records.open('/d/b.md', 1);
    records.setEncoding(id, 1, 'windows-1252');
    await searches.search(1, 'needle', ANY_CASE);
    expect(tasks.calls.map(({ task, input }) => [task, (input as { encoding: unknown }).encoding])).toEqual([
      ['findInBytes', 'windows-1252'],
      ['findInBytes', null],
    ]);
    for (const { input, transfer } of tasks.calls) {
      expect(transfer).toHaveLength(1);
      expect(transfer[0]).toBe((input as { bytes: Uint8Array }).bytes.buffer);
    }
  });

  it('hands over a read that is a view into a larger buffer as it is, never copying it on main', async () => {
    const read = new TextEncoder().encode('a needle!');
    const view = read.subarray(0, 8);
    const { fs, tasks, records, searches } = setup({});
    fs.readFile = async () => view;
    records.open('/d/a.md', 1);
    expect(counts(await searches.search(1, 'needle', ANY_CASE))).toEqual(['id-1:1']);
    const [call] = tasks.calls;
    expect((call!.input as { bytes: Uint8Array }).bytes).toBe(view);
    expect(call!.transfer).toHaveLength(1);
    expect(call!.transfer[0]).toBe(read.buffer);
  });

  it('lists a tab it could not search, with the reason', async () => {
    const { fs, records, searches } = setup({ '/d/bin': new Uint8Array([0, 1, 2]), '/d/locked.md': 'x' });
    for (const file of ['/d/gone.md', '/d/bin', '/d/locked.md']) records.open(file, 1);
    fs.failWith('/d/locked.md', 'EACCES');
    expect(counts(await searches.search(1, 'needle', ANY_CASE))).toEqual(['id-1:missing', 'id-2:binary', 'id-3:no-permission']);
  });

  it('lists a tab whose search overran its budget as too slow', async () => {
    const { tasks, records, searches } = setup({ '/d/a.md': 'needle' });
    records.open('/d/a.md', 1);
    tasks.hang('findInBytes');
    expect(counts(await searches.search(1, 'needle', ANY_CASE))).toEqual(['id-1:too-slow']);
  });

  it('answers a query shorter than two characters at once, reading nothing', async () => {
    const { fs, records, searches } = setup({ '/d/a.md': 'a' });
    records.open('/d/a.md', 1);
    expect(await searches.search(1, 'a', ANY_CASE)).toEqual({ kind: 'done', tabs: [] });
    expect(fs.reads).toEqual([]);
  });

  it('stops a search when a newer query, or an empty one, comes from the same window', async () => {
    const { fs, records, searches } = setup({ '/d/a.md': 'needle', '/d/b.md': 'needle' });
    records.open('/d/a.md', 1);
    records.open('/d/b.md', 1);
    fs.slow = '/d/a.md';
    const old = searches.search(1, 'needle', ANY_CASE);
    const newer = searches.search(1, 'needle', ANY_CASE);
    fs.finishSlowReads();
    expect(await old).toEqual({ kind: 'superseded' });
    expect(counts(await newer)).toEqual(['id-1:1', 'id-2:1']);

    fs.slow = '/d/a.md';
    const cancelled = searches.search(1, 'needle', ANY_CASE);
    expect(await searches.search(1, '', ANY_CASE)).toEqual({ kind: 'done', tabs: [] });
    fs.finishSlowReads();
    expect(await cancelled).toEqual({ kind: 'superseded' });
    expect(fs.reads.filter((file) => file === '/d/b.md')).toHaveLength(1);
  });

  it('reads one file at a time per window however many queries arrive at once, and answers only the last', async () => {
    const { fs, records, searches } = setup({ '/d/a.md': 'needle', '/d/b.md': 'needle' });
    records.open('/d/a.md', 1);
    records.open('/d/b.md', 1);
    fs.slow = '/d/a.md';
    const first = searches.search(1, 'needle', ANY_CASE);
    await vi.waitFor(() => expect(fs.inFlight).toBe(1));
    const all = [first, ...Array.from({ length: 4 }, () => searches.search(1, 'needle', ANY_CASE))];
    fs.finishSlowReads();
    const results = await Promise.all(all);
    expect(results.slice(0, 4)).toEqual(Array(4).fill({ kind: 'superseded' }));
    expect(counts(results[4]!)).toEqual(['id-1:1', 'id-2:1']);
    expect(fs.mostInFlight).toBe(1);
    expect(fs.reads).toEqual(['/d/a.md', '/d/a.md', '/d/b.md']);
  });

  it("leaves another window's search running", async () => {
    const { fs, records, searches } = setup({ '/d/a.md': 'needle', '/d/b.md': 'needle' });
    records.open('/d/a.md', 1);
    records.open('/d/b.md', 2);
    fs.slow = '/d/a.md';
    const first = searches.search(1, 'needle', ANY_CASE);
    expect(counts(await searches.search(2, 'needle', ANY_CASE))).toEqual(['id-2:1']);
    fs.finishSlowReads();
    expect(counts(await first)).toEqual(['id-1:1']);
  });
});

describe('findInTextTask', () => {
  it('refuses input that is not a text, a query and a case flag', () => {
    expect(findInTextTask({ text: 'a needle', query: 'needle', caseSensitive: false })).toMatchObject({ count: 1 });
    for (const bad of [null, {}, { text: 1, query: 'x', caseSensitive: false }, { text: '', query: 'xx', caseSensitive: 'no' }]) {
      expect(() => findInTextTask(bad)).toThrow(/findInText: bad input/);
    }
  });
});

describe('findInBytesTask', () => {
  const bytesOf = (text: string) => new TextEncoder().encode(text);

  it("decodes a file's bytes as a tab would read them, then matches", () => {
    expect(findInBytesTask({ bytes: bytesOf('a needle, a NEEDLE'), encoding: null, query: 'needle', caseSensitive: false }, decode)).toMatchObject({ count: 2 });
    const cafe = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
    expect(findInBytesTask({ bytes: cafe, encoding: null, query: 'café', caseSensitive: false }, decode)).toMatchObject({ count: 1 });
    expect(findInBytesTask({ bytes: cafe, encoding: 'windows-1252', query: 'café', caseSensitive: true }, decode)).toMatchObject({ count: 1 });
  });

  it('answers binary for a file a tab would show as binary', () => {
    expect(findInBytesTask({ bytes: new Uint8Array([0, 1, 2]), encoding: null, query: 'xx', caseSensitive: false }, decode)).toEqual({ binary: true });
  });

  it('refuses input that is not bytes, an encoding or none, a query and a case flag', () => {
    const good = { bytes: bytesOf('x'), encoding: null, query: 'xx', caseSensitive: false };
    for (const bad of [null, {}, { ...good, bytes: 'x' }, { ...good, encoding: 1 }, { ...good, query: 1 }, { ...good, caseSensitive: 'no' }]) {
      expect(() => findInBytesTask(bad, decode)).toThrow(/findInBytes: bad input/);
    }
  });
});
