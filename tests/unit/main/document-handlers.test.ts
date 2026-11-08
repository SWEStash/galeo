import path from 'node:path';
import type { DocumentMenuChoice } from '../../../src/shared/contracts/ipc';
import { describe, expect, it } from 'vitest';
import { EditGrants } from '../../../src/core/documents/edit-grants';
import { TabSearches, findInBytesTask } from '../../../src/core/documents/find-all';
import { ImageGrants } from '../../../src/core/documents/images';
import { DocumentLinks } from '../../../src/core/documents/links';
import { ReadIdentities } from '../../../src/core/documents/identities';
import type { ChainedHash } from '../../../src/core/documents/incremental';
import { TabRegistry } from '../../../src/core/tabs/registry';
import { ExternalOpenLimiter } from '../../../src/core/links/limiter';
import type { Decode } from '../../../src/core/text/decode';
import { documentHandlers } from '../../../src/main/documents/handlers';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { findInTextTask } from '../../../src/shared/find';
import { referencesTask } from '../../../src/shared/markdown/references';
import { FakeClock, FakeFileSystem, FakeOsShell, FakeTaskRunner } from '../../helpers/fakes';

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);
const event = { sender: { id: 1 }, senderFrame: { url: 'galeo://app/index.html', parent: null } } as WindowIpcEvent;

/** A file system whose reads of `slow` wait until released (a release before the read counts too). */
class SlowFileSystem extends FakeFileSystem {
  reads = 0;
  private released = false;
  private release: (() => void) | undefined;
  constructor(files: Record<string, string>, private readonly slow: string) {
    super(files);
  }
  override async readFile(file: string, options: { maxBytes: number }): Promise<Uint8Array> {
    this.reads++;
    if (file === this.slow && !this.released) await new Promise<void>((resolve) => (this.release = resolve));
    return super.readFile(file, options);
  }
  finishSlowRead() {
    this.released = true;
    this.release?.();
  }
}

/** A stand-in chained hash giving the same text as the handlers' `hash`: `#` and the bytes as text. */
const textHash = (seen: number[]): ChainedHash => ({
  update: (bytes) => textHash([...seen, ...bytes]),
  digest: () => `#${new TextDecoder().decode(Uint8Array.from(seen))}`,
});

function setup(files: Record<string, string>, slow = '', { credits = Infinity, choice = null as DocumentMenuChoice | null } = {}) {
  const fs = new SlowFileSystem(files, slow);
  const grants = new EditGrants();
  const pdfs: string[] = [];
  const input = { left: credits, spend: () => input.left-- > 0, received: () => void input.left++ };
  // Copies of what was sent are kept from 1 byte, so small files show the appends of ADR-033.
  const reads = new ReadIdentities(fs, { minBytes: 1, maxTotalBytes: 1024 * 1024 });
  const answers: string[] = [];
  let n = 0;
  const records = new TabRegistry(() => `id-${++n}`);
  const links = new DocumentLinks({
    records,
    input: { spend: () => true },
    fs,
    images: new ImageGrants(() => `img-${++n}`),
    tasks: new FakeTaskRunner({ references: (input) => referencesTask(input) }),
    shell: new FakeOsShell(),
    limiter: new ExternalOpenLimiter(new FakeClock()),
    confirmBurst: async () => true,
    dirname: path.posix.dirname,
    resolve: path.posix.resolve,
    parseUrl: () => null,
  });
  const opened: string[] = [];
  const menus: string[] = [];
  const handlers = documentHandlers({
    records,
    links,
    reads,
    fs,
    decode,
    hash: (bytes) => `#${new TextDecoder().decode(bytes)}`,
    chain: (bytes) => textHash([...bytes]),
    samePrefix: (prefix, bytes) => prefix.every((value, i) => bytes[i] === value),
    grants,
    input,
    unsaved: { answer: (window, answer) => void answers.push(`${window}:${answer}`) },
    opened: (path, window) => opened.push(`${window}:${path}`),
    searches: new TabSearches({ records, grants, fs, tasks: new FakeTaskRunner({ findInText: findInTextTask, findInBytes: (input) => findInBytesTask(input, decode) }) }),
    pdf: { choose: async (window, name) => (pdfs.push(`choose ${window} ${name}`), 'token'), print: async (window, token) => (pdfs.push(`print ${window} ${token}`), 'saved') },
    menus: {
      path: async (id, window) => void menus.push(`path ${id} ${window}`),
      document: async (id, window, context) => (menus.push(`document ${id} ${window} ${JSON.stringify(context)}`), choice),
    },
  });
  return { fs, records, handlers, opened, grants, input, reads, answers, menus, pdfs, id: records.open(Object.keys(files)[0]!, 1).id };
}

describe('documentHandlers', () => {
  it("searches only the sender window's tabs", async () => {
    const { records, handlers } = setup({ '/d/a.md': 'a needle', '/d/b.md': 'b needle' });
    records.open('/d/b.md', 2);
    const result = await handlers['documents.findAll'](['needle', { caseSensitive: false }], event);
    expect(result.kind === 'done' && result.tabs.map((tab) => tab.id)).toEqual(['id-1']);
  });

  it('refuses to read the settings tab as a file', async () => {
    const { records, handlers } = setup({ '/d/a.md': '# a' });
    const settings = records.openSettings(1);
    expect(() => handlers['documents.read']([settings.id, null], event)).toThrow(/not a document/);
  });

  it("shows a document's menus, never the settings tab's", async () => {
    const { records, handlers, menus, id } = setup({ '/d/a.md': '# a' });
    await handlers['documents.pathMenu']([id], event);
    await handlers['documents.contextMenu']([id, { tree: true, rich: false }], event);
    const settings = records.openSettings(1);
    expect(() => handlers['documents.pathMenu']([settings.id], event)).toThrow(/not a document/);
    await expect(handlers['documents.contextMenu']([settings.id, { tree: false, rich: false }], event)).rejects.toThrow(/not a document/);
    expect(menus).toEqual([`path ${id} 1`, `document ${id} 1 {"tree":true,"rich":false}`]);
  });

  it("exports a document, named by its file, never the settings tab", async () => {
    const { records, handlers, pdfs, id } = setup({ '/d/notes.md': '# a' });
    expect(await handlers['documents.exportPdf']([id], event)).toBe('token');
    expect(await handlers['documents.printPdf'](['token'], event)).toBe('saved');
    expect(pdfs).toEqual(['choose 1 notes.md', 'print 1 token']);
    const settings = records.openSettings(1);
    await expect(async () => handlers['documents.exportPdf']([settings.id], event)).rejects.toThrow(/not a document/);
  });

  it("counts a choice in the document's menu as input, so the Save the page runs next works", async () => {
    const chosen = setup({ '/d/a.md': '# a' }, '', { credits: 0, choice: 'save' });
    expect(await chosen.handlers['documents.contextMenu']([chosen.id, { tree: false, rich: false }], event)).toBe('save');
    expect(chosen.input.left).toBe(1);
    const dismissed = setup({ '/d/a.md': '# a' }, '', { credits: 0 });
    expect(await dismissed.handlers['documents.contextMenu']([dismissed.id, { tree: false, rich: false }], event)).toBeNull();
    expect(dismissed.input.left).toBe(0);
  });

  it('keeps the links of the document it read, not of one read earlier that finished later', async () => {
    const { fs, records, handlers, id } = setup({ '/d/x.md': '[from x](x-target.md)', '/d/y.md': '[from y](y-target.md)' }, '/d/x.md');
    const slowRead = handlers['documents.read']([id, null], event);
    records.navigate(id, 1, { path: '/d/y.md', anchor: null });
    await handlers['documents.read']([id, null], event);
    fs.finishSlowRead();
    await slowRead;
    expect(await handlers['documents.followLink']([id, 'y-target.md', 'current'], event)).toEqual({ kind: 'navigated', anchor: null });
    records.back(id, 1);
    expect(await handlers['documents.followLink']([id, 'x-target.md', 'current'], event)).toEqual({
      kind: 'refused',
      reason: 'not-in-document',
    });
  });

  it('keeps the links of an MDX article, parsed as MDX', async () => {
    const { handlers, id } = setup({ '/d/post.mdx': 'see [x](x.md)\n\n{"[y](y.md)"}', '/d/x.md': '# x' });
    expect(await handlers['documents.read']([id, null], event)).toMatchObject({ state: 'ready', format: 'mdx' });
    // As Markdown the expression would be a link; in MDX it is code.
    expect(await handlers['documents.followLink']([id, 'y.md', 'current'], event)).toEqual({ kind: 'refused', reason: 'not-in-document' });
    expect(await handlers['documents.followLink']([id, 'x.md', 'current'], event)).toEqual({ kind: 'navigated', anchor: null });
  });

  it('keeps no text for documents without links: logs and plain text', async () => {
    const { handlers, id } = setup({ '/d/app.log': 'INFO see [x](x.md)' });
    expect(await handlers['documents.read']([id, null], event)).toMatchObject({ state: 'ready', format: 'log' });
    expect(await handlers['documents.followLink']([id, 'x.md', 'current'], event)).toEqual({ kind: 'refused', reason: 'not-in-document' });
  });

  it('sends only what was added when the page holds the version it last got (ADR-033)', async () => {
    const { fs, handlers, id } = setup({ '/d/a.log': 'one\n' });
    expect(await handlers['documents.read']([id, null], event)).toMatchObject({ state: 'ready', text: 'one\n', version: '#one\n' });
    fs.write('/d/a.log', 'one\ntwo\n');
    expect(await handlers['documents.read']([id, '#one\n'], event)).toEqual({ state: 'appended', path: '/d/a.log', base: '#one\n', text: 'two\n', size: 8, version: '#one\ntwo\n' });
    fs.write('/d/a.log', 'one\ntwo\nthree\n');
    expect(await handlers['documents.read']([id, 'not what was sent'], event)).toMatchObject({ state: 'ready', text: 'one\ntwo\nthree\n' });
  });

  it('reads in full once the reader chose another encoding', async () => {
    const { fs, handlers, id } = setup({ '/d/a.log': 'one\n' });
    await handlers['documents.read']([id, null], event);
    handlers['documents.setEncoding']([id, 'windows-1252'], event);
    fs.write('/d/a.log', 'one\ntwo\n');
    expect(await handlers['documents.read']([id, '#one\n'], event)).toMatchObject({ state: 'ready', encoding: 'windows-1252' });
  });

  it('never lets two reads of one tab overlap: a request waits for the one running', async () => {
    const { fs, handlers, id } = setup({ '/d/a.log': 'one\n' }, '/d/a.log');
    const first = handlers['documents.read']([id, null], event);
    const second = handlers['documents.read']([id, '#one\n'], event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fs.reads).toBe(1);
    fs.finishSlowRead();
    expect(await first).toMatchObject({ state: 'ready' });
    expect(await second).toMatchObject({ state: 'appended', text: '' });
    expect(fs.reads).toBe(2);
  });

  it('shares one read between concurrent requests for the same document', async () => {
    const { fs, handlers, id } = setup({ '/d/a.md': '# a' }, '/d/a.md');
    const reads = [1, 2, 3, 4].map(() => handlers['documents.read']([id, null], event));
    fs.finishSlowRead();
    const results = await Promise.all(reads);
    expect(fs.reads).toBe(1);
    expect(new Set(results.map((result) => result.state))).toEqual(new Set(['ready']));
  });
});

describe('recent files', () => {
  it('count a file once it was read, and not a missing one', async () => {
    const { fs, handlers, opened, id } = setup({ '/d/a.md': '# a' });
    await handlers['documents.read']([id, null], event);
    fs.delete('/d/a.md');
    await handlers['documents.read']([id, null], event);
    expect(opened).toEqual(['1:/d/a.md']);
  });

  it("count a tab's file once, not again on every re-read (a wake, a changed file)", async () => {
    const { handlers, records, opened, id } = setup({ '/d/a.md': '# a', '/d/b.md': '# b' });
    await handlers['documents.read']([id, null], event);
    await handlers['documents.read']([id, null], event);
    records.navigate(id, 1, { path: '/d/b.md', anchor: null });
    await handlers['documents.read']([id, null], event);
    expect(opened).toEqual(['1:/d/a.md', '1:/d/b.md']);
  });
});

describe('documents.setEncoding', () => {
  it('reads the document with the chosen encoding from then on, and back to detection with null', async () => {
    const { fs, handlers, id } = setup({ '/d/a.txt': 'x' });
    fs.write('/d/a.txt', new Uint8Array([0x43, 0x61, 0x66, 0xe9]));
    expect(await handlers['documents.read']([id, null], event)).toMatchObject({ text: 'Café', encoding: 'windows-1252', guessedEncoding: true });
    handlers['documents.setEncoding']([id, 'utf-8'], event);
    expect(await handlers['documents.read']([id, null], event)).toMatchObject({ text: 'Caf�', encoding: 'utf-8', guessedEncoding: false });
    handlers['documents.setEncoding']([id, null], event);
    expect(await handlers['documents.read']([id, null], event)).toMatchObject({ encoding: 'windows-1252', guessedEncoding: true });
  });

  it("refuses another window's document", () => {
    const { handlers, id } = setup({ '/d/a.txt': 'x' });
    expect(() => handlers['documents.setEncoding']([id, 'utf-8'], { ...event, sender: { id: 2 } } as WindowIpcEvent)).toThrow();
  });
});

describe('documentHandlers saving', () => {
  const otherWindow = { ...event, sender: { id: 2 } } as WindowIpcEvent;
  const text = async (fs: FakeFileSystem, file: string) => new TextDecoder().decode(await fs.readFile(file, { maxBytes: 1 << 20 }));

  it('saves a tab in edit mode, and the save is not reported as a change on disk', async () => {
    const { fs, handlers, grants, reads, id } = setup({ '/d/a.md': 'old' });
    await handlers['documents.read']([id, null], event);
    grants.grant(id, 1, '/d/a.md');

    // A longer text: the file's identity (size) changes, as it would on disk.
    expect(await handlers['documents.save']([id, 'new text', '#old'], event)).toEqual({ kind: 'saved', version: '#new text' });

    expect(await text(fs, '/d/a.md')).toBe('new text');
    expect(await reads.changed(id, '/d/a.md')).toBe(false);
  });

  it('refuses a tab not in edit mode, and writes nothing', async () => {
    const { fs, handlers, id } = setup({ '/d/a.md': 'old' });
    expect(await handlers['documents.save']([id, 'new', '#old'], event)).toEqual({ kind: 'refused', reason: 'not-editable' });
    expect(fs.saves).toEqual([]);
  });

  it("refuses a save no input of the reader's asked for", async () => {
    const { fs, handlers, grants, id } = setup({ '/d/a.md': 'old' }, '', { credits: 0 });
    grants.grant(id, 1, '/d/a.md');
    expect(await handlers['documents.save']([id, 'new', '#old'], event)).toEqual({ kind: 'refused', reason: 'no-input' });
    expect(fs.saves).toEqual([]);
  });

  it("refuses another window's tab as unknown", async () => {
    const { handlers, grants, id } = setup({ '/d/a.md': 'old' });
    grants.grant(id, 1, '/d/a.md');
    await expect(handlers['documents.save']([id, 'new', '#old'], otherWindow)).rejects.toThrow(/unknown document/);
  });

  it('answers a conflict when the file changed since the page loaded it', async () => {
    const { fs, handlers, grants, id } = setup({ '/d/a.md': 'old' });
    grants.grant(id, 1, '/d/a.md');
    fs.write('/d/a.md', 'theirs');
    expect(await handlers['documents.save']([id, 'mine', '#old'], event)).toEqual({ kind: 'conflict', version: '#theirs' });
    expect(await text(fs, '/d/a.md')).toBe('theirs');
  });

  it('writes a file deleted while edited again, with no base, in the line endings it was read with', async () => {
    const { fs, handlers, grants, id } = setup({ '/d/a.md': 'a\r\nb\r\n' });
    await handlers['documents.read']([id, null], event);
    grants.grant(id, 1, '/d/a.md');
    fs.delete('/d/a.md');
    expect(await handlers['documents.save']([id, 'a\nb\nc\n', null], event)).toEqual({ kind: 'saved', version: '#a\r\nb\r\nc\r\n' });
    expect(await text(fs, '/d/a.md')).toBe('a\r\nb\r\nc\r\n');
  });

  it('saves in the encoding the reader chose for the tab', async () => {
    const { fs, handlers, grants, id } = setup({ '/d/a.md': 'abc' });
    grants.grant(id, 1, '/d/a.md');
    handlers['documents.setEncoding']([id, 'windows-1252'], event);
    await handlers['documents.save']([id, 'é', '#abc'], event);
    expect([...(await fs.readFile('/d/a.md', { maxBytes: 10 }))]).toEqual([0xe9]);
  });

  it('takes unsaved state and leaving edit mode from the tab\'s own window only', () => {
    const { handlers, grants, id } = setup({ '/d/a.md': 'old' });
    grants.grant(id, 1, '/d/a.md');
    handlers['documents.dirty']([id, true], otherWindow);
    expect(grants.dirty(1)).toEqual([]);
    handlers['documents.dirty']([id, true], event);
    expect(grants.dirty(1)).toEqual([id]);
    handlers['documents.leaveEdit']([id], otherWindow);
    expect(grants.allows(id, 1, '/d/a.md')).toBe(true);
    handlers['documents.leaveEdit']([id], event);
    expect(grants.allows(id, 1, '/d/a.md')).toBe(false);
  });

  it("passes the page's answer about unsaved changes on, as its own window's", () => {
    const { handlers, answers } = setup({ '/d/a.md': 'old' });
    handlers['documents.closeAnswer'](['asking'], event);
    handlers['documents.closeAnswer'](['cancel'], otherWindow);
    expect(answers).toEqual(['1:asking', '2:cancel']);
  });

  it("holds a tab's unsaved text for its own window only, and gives it back after a crash", () => {
    const { handlers, grants, id } = setup({ '/d/a.md': 'old' });
    grants.grant(id, 1, '/d/a.md');
    handlers['documents.keep']([id, 'theirs', 'v'], otherWindow);
    expect(handlers['documents.recover']([id], event)).toEqual({ edit: true, kept: null });
    handlers['documents.keep']([id, '# mine', 'v1'], event);
    expect(handlers['documents.recover']([id], otherWindow)).toEqual({ edit: false, kept: null });
    expect(handlers['documents.recover']([id], event)).toEqual({ edit: true, kept: { text: '# mine', base: 'v1' } });
    handlers['documents.keep']([id, '# mine', null], event);
    expect(handlers['documents.recover']([id], event)).toEqual({ edit: true, kept: { text: '# mine', base: null } });
  });

  it('says a tab is in edit mode with nothing unsaved, so a tab moved in arrives editable (ADR-019)', () => {
    const { handlers, grants, id } = setup({ '/d/a.md': 'old' });
    expect(handlers['documents.recover']([id], event)).toEqual({ edit: false, kept: null });
    grants.grant(id, 1, '/d/a.md');
    expect(handlers['documents.recover']([id], event)).toEqual({ edit: true, kept: null });
  });
});

describe('documents.toggleTask (ADR-031)', () => {
  const plan = '- [ ] one\n- [x] two\n';
  const otherWindow = { ...event, sender: { id: 2 } } as WindowIpcEvent;
  const text = async (fs: FakeFileSystem, file: string) => new TextDecoder().decode(await fs.readFile(file, { maxBytes: 1 << 20 }));

  it("ticks a task item's box while reading, on the reader's input, as a save that isn't a change on disk", async () => {
    const { fs, handlers, reads, id } = setup({ '/d/plan.md': plan });
    await handlers['documents.read']([id, null], event);
    expect(await handlers['documents.toggleTask']([id, 1, `#${plan}`], event)).toEqual({ kind: 'saved', version: '#- [x] one\n- [x] two\n' });
    expect(await text(fs, '/d/plan.md')).toBe('- [x] one\n- [x] two\n');
    expect(await reads.changed(id, '/d/plan.md')).toBe(false);
  });

  it('refuses in edit mode, where the editor holds the text, and without input; writes nothing', async () => {
    const editing = setup({ '/d/plan.md': plan });
    editing.grants.grant(editing.id, 1, '/d/plan.md');
    expect(await editing.handlers['documents.toggleTask']([editing.id, 1, `#${plan}`], event)).toEqual({ kind: 'refused', reason: 'editing' });
    expect(editing.fs.saves).toEqual([]);
    const idle = setup({ '/d/plan.md': plan }, '', { credits: 0 });
    expect(await idle.handlers['documents.toggleTask']([idle.id, 1, `#${plan}`], event)).toEqual({ kind: 'refused', reason: 'no-input' });
    expect(idle.fs.saves).toEqual([]);
  });

  it("refuses another window's tab and the Settings tab", async () => {
    const { handlers, records, id } = setup({ '/d/plan.md': plan });
    await expect(handlers['documents.toggleTask']([id, 1, `#${plan}`], otherWindow)).rejects.toThrow(/unknown document/);
    const settings = records.openSettings(1);
    await expect(handlers['documents.toggleTask']([settings.id, 1, `#${plan}`], event)).rejects.toThrow();
  });
});

describe('documents.missingLinks', () => {
  it("answers the read document's links to files that don't exist", async () => {
    const { handlers, id } = setup({ '/d/plan.md': '[here](notes.md) [gone](gone.md) [web](https://example.com)\n', '/d/notes.md': 'x' });
    await handlers['documents.read']([id, null], event);
    expect(await handlers['documents.missingLinks']([id], event)).toEqual(['gone.md']);
  });
});
