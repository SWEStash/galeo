import path from 'node:path';
import { describe, expect, it } from 'vitest';
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

function setup(files: Record<string, string>, slow = '') {
  const fs = new SlowFileSystem(files, slow);
  let n = 0;
  const records = new TabRegistry(() => `id-${++n}`);
  const links = new DocumentLinks({
    records,
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
  const handlers = documentHandlers({ records, links, reads: new ReadIdentities(fs), fs, decode, opened: (path) => opened.push(path) });
  return { fs, records, handlers, opened, id: records.open(Object.keys(files)[0]!, 1).id };
}

describe('documentHandlers', () => {
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
    expect(opened).toEqual(['/d/a.md']);
  });

  it("count a tab's file once, not again on every re-read (a wake, a changed file)", async () => {
    const { handlers, records, opened, id } = setup({ '/d/a.md': '# a', '/d/b.md': '# b' });
    await handlers['documents.read']([id], event);
    await handlers['documents.read']([id], event);
    records.navigate(id, 1, { path: '/d/b.md', anchor: null });
    await handlers['documents.read']([id], event);
    expect(opened).toEqual(['/d/a.md', '/d/b.md']);
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
