import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EditGrants } from '../../../src/core/documents/edit-grants';
import { ImageGrants } from '../../../src/core/documents/images';
import { DocumentLinks } from '../../../src/core/documents/links';
import { ReadIdentities } from '../../../src/core/documents/identities';
import { TabRegistry } from '../../../src/core/tabs/registry';
import { ExternalOpenLimiter } from '../../../src/core/links/limiter';
import type { Decode } from '../../../src/core/text/decode';
import { documentHandlers } from '../../../src/main/documents/handlers';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { extractReferences } from '../../../src/shared/markdown/references';
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

function setup(files: Record<string, string>, slow = '', { credits = Infinity } = {}) {
  const fs = new SlowFileSystem(files, slow);
  const grants = new EditGrants();
  const input = { left: credits, spend: () => input.left-- > 0 };
  const reads = new ReadIdentities(fs);
  let n = 0;
  const records = new TabRegistry(() => `id-${++n}`);
  const links = new DocumentLinks({
    records,
    input: { spend: () => true },
    fs,
    images: new ImageGrants(() => `img-${++n}`),
    tasks: new FakeTaskRunner({ references: (text) => extractReferences(text as string) }),
    shell: new FakeOsShell(),
    limiter: new ExternalOpenLimiter(new FakeClock()),
    confirmBurst: async () => true,
    dirname: path.posix.dirname,
    resolve: path.posix.resolve,
    parseUrl: () => null,
  });
  const opened: string[] = [];
  const handlers = documentHandlers({
    records,
    links,
    reads,
    fs,
    decode,
    hash: (bytes) => `#${new TextDecoder().decode(bytes)}`,
    grants,
    input,
    opened: (path, window) => opened.push(`${window}:${path}`),
  });
  return { fs, records, handlers, opened, grants, input, reads, id: records.open(Object.keys(files)[0]!, 1).id };
}

describe('documentHandlers', () => {
  it('refuses to read the settings tab as a file', async () => {
    const { records, handlers } = setup({ '/d/a.md': '# a' });
    const settings = records.openSettings(1);
    expect(() => handlers['documents.read']([settings.id], event)).toThrow(/not a document/);
  });

  it('keeps the links of the document it read, not of one read earlier that finished later', async () => {
    const { fs, records, handlers, id } = setup({ '/d/x.md': '[from x](x-target.md)', '/d/y.md': '[from y](y-target.md)' }, '/d/x.md');
    const slowRead = handlers['documents.read']([id], event);
    records.navigate(id, 1, { path: '/d/y.md', anchor: null });
    await handlers['documents.read']([id], event);
    fs.finishSlowRead();
    await slowRead;
    expect(await handlers['documents.followLink']([id, 'y-target.md', 'current'], event)).toEqual({ kind: 'navigated', anchor: null });
    records.back(id, 1);
    expect(await handlers['documents.followLink']([id, 'x-target.md', 'current'], event)).toEqual({
      kind: 'refused',
      reason: 'not-in-document',
    });
  });

  it('keeps no text for documents without links: logs and plain text', async () => {
    const { handlers, id } = setup({ '/d/app.log': 'INFO see [x](x.md)' });
    expect(await handlers['documents.read']([id], event)).toMatchObject({ state: 'ready', format: 'log' });
    expect(await handlers['documents.followLink']([id, 'x.md', 'current'], event)).toEqual({ kind: 'refused', reason: 'not-in-document' });
  });

  it('shares one read between concurrent requests for the same document', async () => {
    const { fs, handlers, id } = setup({ '/d/a.md': '# a' }, '/d/a.md');
    const reads = [1, 2, 3, 4].map(() => handlers['documents.read']([id], event));
    fs.finishSlowRead();
    const results = await Promise.all(reads);
    expect(fs.reads).toBe(1);
    expect(new Set(results.map((result) => result.state))).toEqual(new Set(['ready']));
  });
});

describe('recent files', () => {
  it('count a file once it was read, and not a missing one', async () => {
    const { fs, handlers, opened, id } = setup({ '/d/a.md': '# a' });
    await handlers['documents.read']([id], event);
    fs.delete('/d/a.md');
    await handlers['documents.read']([id], event);
    expect(opened).toEqual(['1:/d/a.md']);
  });

  it("count a tab's file once, not again on every re-read (a wake, a changed file)", async () => {
    const { handlers, records, opened, id } = setup({ '/d/a.md': '# a', '/d/b.md': '# b' });
    await handlers['documents.read']([id], event);
    await handlers['documents.read']([id], event);
    records.navigate(id, 1, { path: '/d/b.md', anchor: null });
    await handlers['documents.read']([id], event);
    expect(opened).toEqual(['1:/d/a.md', '1:/d/b.md']);
  });
});

describe('documents.setEncoding', () => {
  it('reads the document with the chosen encoding from then on, and back to detection with null', async () => {
    const { fs, handlers, id } = setup({ '/d/a.txt': 'x' });
    fs.write('/d/a.txt', new Uint8Array([0x43, 0x61, 0x66, 0xe9]));
    expect(await handlers['documents.read']([id], event)).toMatchObject({ text: 'Café', encoding: 'windows-1252', guessedEncoding: true });
    handlers['documents.setEncoding']([id, 'utf-8'], event);
    expect(await handlers['documents.read']([id], event)).toMatchObject({ text: 'Caf�', encoding: 'utf-8', guessedEncoding: false });
    handlers['documents.setEncoding']([id, null], event);
    expect(await handlers['documents.read']([id], event)).toMatchObject({ encoding: 'windows-1252', guessedEncoding: true });
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
    await handlers['documents.read']([id], event);
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
});
