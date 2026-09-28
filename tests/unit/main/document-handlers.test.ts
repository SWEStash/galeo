import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImageGrants } from '../../../src/core/documents/images';
import { DocumentLinks } from '../../../src/core/documents/links';
import { DocumentRecords } from '../../../src/core/documents/records';
import { ExternalOpenLimiter } from '../../../src/core/links/limiter';
import type { Decode } from '../../../src/core/text/decode';
import { documentHandlers } from '../../../src/main/documents/handlers';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { extractReferences } from '../../../src/shared/markdown/references';
import { FakeClock, FakeFileSystem, FakeOsShell, FakeTaskRunner } from '../../helpers/fakes';

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);
const event = { sender: { id: 1 }, senderFrame: { url: 'galeo://app/index.html', parent: null } } as WindowIpcEvent;

/** A file system whose reads of `slow` wait until released. */
class SlowFileSystem extends FakeFileSystem {
  reads = 0;
  private release: (() => void) | undefined;
  constructor(files: Record<string, string>, private readonly slow: string) {
    super(files);
  }
  override async readFile(file: string, options: { maxBytes: number }): Promise<Uint8Array> {
    this.reads++;
    if (file === this.slow) await new Promise<void>((resolve) => (this.release = resolve));
    return super.readFile(file, options);
  }
  finishSlowRead() {
    this.release?.();
  }
}

function setup(files: Record<string, string>, slow = '') {
  const fs = new SlowFileSystem(files, slow);
  let n = 0;
  const records = new DocumentRecords(() => `id-${++n}`);
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
  const handlers = documentHandlers({ records, links, fs, decode });
  return { fs, records, handlers, id: records.open(Object.keys(files)[0]!, 1).id };
}

describe('documentHandlers', () => {
  it('keeps the links of the document it read, not of one read earlier that finished later', async () => {
    const { fs, records, handlers, id } = setup({ '/d/x.md': '[from x](x-target.md)', '/d/y.md': '[from y](y-target.md)' }, '/d/x.md');
    const slowRead = handlers['documents.read']([id], event);
    records.navigate(id, 1, { path: '/d/y.md', anchor: null });
    await handlers['documents.read']([id], event);
    fs.finishSlowRead();
    await slowRead;
    expect(await handlers['documents.followLink']([id, 'y-target.md'], event)).toEqual({ kind: 'navigated', anchor: null });
    records.back(id, 1);
    expect(await handlers['documents.followLink']([id, 'x-target.md'], event)).toEqual({
      kind: 'refused',
      reason: 'not-in-document',
    });
  });

  it('keeps no text for documents without links: logs and plain text', async () => {
    const { handlers, id } = setup({ '/d/app.log': 'INFO see [x](x.md)' });
    expect(await handlers['documents.read']([id], event)).toMatchObject({ state: 'ready', format: 'log' });
    expect(await handlers['documents.followLink']([id, 'x.md'], event)).toEqual({ kind: 'refused', reason: 'not-in-document' });
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
