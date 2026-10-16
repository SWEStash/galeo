import { describe, expect, it } from 'vitest';
import { readDocument, READ_MAX_BYTES } from '../../../src/core/documents/read';
import type { Decode } from '../../../src/core/text/decode';
import { FakeFileSystem } from '../../helpers/fakes/file-system';

const decode: Decode = (bytes, encoding, { fatal }) =>
  new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);

/** A stand-in content hash: the bytes themselves, readable in expectations. */
const hash = (bytes: Uint8Array) => `#${[...bytes].join('.')}`;

const read = (fs: FakeFileSystem, path: string, options: { renderAnyway?: boolean } = {}) =>
  readDocument(path, { fs, decode, hash, ...options });

describe('readDocument', () => {
  it('tells what shape the text had (encoding, byte order mark, line endings) for a file it shows, and only for those', async () => {
    const fs = new FakeFileSystem({ '/d/a.md': Uint8Array.from([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a]), '/d/empty.md': '' });
    const shapes: unknown[] = [];
    await readDocument('/d/a.md', { fs, decode, hash, shaped: (shape) => shapes.push(shape) });
    await readDocument('/d/empty.md', { fs, decode, hash, shaped: (shape) => shapes.push(shape) });
    await readDocument('/d/gone.md', { fs, decode, hash, shaped: (shape) => shapes.push(shape) });
    expect(shapes).toEqual([{ encoding: 'utf-8', bom: true, lineEnding: 'crlf' }]);
  });

  it('reads Markdown, ready to render', async () => {
    const fs = new FakeFileSystem({ '/d/a.md': '# Hi\n' });
    expect(await read(fs, '/d/a.md')).toEqual({
      state: 'ready',
      path: '/d/a.md',
      format: 'markdown',
      view: 'rendered',
      banner: null,
      text: '# Hi\n',
      encoding: 'utf-8',
      guessedEncoding: false,
      size: 5,
      version: '#35.32.72.105.10',
    });
  });

  it("names the version it read by the content's hash, so a save can tell whether the file changed since", async () => {
    const fs = new FakeFileSystem({ '/d/a.md': 'one', '/d/b.md': 'one', '/d/c.md': 'two' });
    const [a, b, c] = await Promise.all(['/d/a.md', '/d/b.md', '/d/c.md'].map((path) => read(fs, path)));
    expect(a).toMatchObject({ version: hash(new TextEncoder().encode('one')) });
    expect(b).toMatchObject({ version: (a as { version: string }).version });
    expect(c).not.toMatchObject({ version: (a as { version: string }).version });
  });

  it('opens a log in the source view', async () => {
    const fs = new FakeFileSystem({ '/d/app.log': 'INFO ok\n' });
    expect(await read(fs, '/d/app.log')).toMatchObject({ state: 'ready', format: 'log', view: 'source' });
  });

  it('shows Markdown over the render limit as source with a banner, unless rendering anyway', async () => {
    const fs = new FakeFileSystem({ '/d/big.md': 'x'.repeat(5 * 1024 * 1024 + 1) });
    // Spelling out 5 MB of bytes would take most of the test's time budget under a full run.
    const big = (options: { renderAnyway?: boolean } = {}) => readDocument('/d/big.md', { fs, decode, hash: () => '#big', ...options });
    expect(await big()).toMatchObject({ state: 'ready', view: 'source', banner: 'too-large' });
    expect(await big({ renderAnyway: true })).toMatchObject({ view: 'rendered', banner: null });
  });

  it('flags a Windows-1252 guess for the encoding banner', async () => {
    const fs = new FakeFileSystem({ '/d/latin.txt': Uint8Array.from([0x63, 0x61, 0x66, 0xe9]) });
    expect(await read(fs, '/d/latin.txt')).toMatchObject({
      state: 'ready',
      text: 'café',
      encoding: 'windows-1252',
      guessedEncoding: true,
    });
  });

  it('reports an empty file', async () => {
    const fs = new FakeFileSystem({ '/d/empty.md': '' });
    expect(await read(fs, '/d/empty.md')).toEqual({ state: 'empty', path: '/d/empty.md', format: 'markdown' });
  });

  it('reports a binary file with its size', async () => {
    const fs = new FakeFileSystem({ '/d/x.md': Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]) });
    expect(await read(fs, '/d/x.md')).toEqual({ state: 'binary', path: '/d/x.md', size: 5 });
  });

  it('reports a file over the read cap as too large, without reading it', async () => {
    const fs = new FakeFileSystem({ '/d/huge.log': 'x' });
    fs.failWith('/d/huge.log', 'ETOOBIG');
    expect(await read(fs, '/d/huge.log')).toEqual({ state: 'too-large', path: '/d/huge.log', maxBytes: READ_MAX_BYTES });
  });

  it.each([
    ['ENOENT', 'missing'],
    ['EACCES', 'no-permission'],
    ['EISDIR', 'not-a-file'],
    ['ENOTFILE', 'not-a-file'],
    ['EOTHER', 'unreadable'],
  ] as const)('maps %s to the %s state', async (code, state) => {
    const fs = new FakeFileSystem({ '/d/a.md': 'x' });
    fs.failWith('/d/a.md', code);
    expect(await read(fs, '/d/a.md')).toEqual({ state, path: '/d/a.md' });
  });

  it('reports a missing file', async () => {
    expect(await read(new FakeFileSystem(), '/d/gone.md')).toEqual({ state: 'missing', path: '/d/gone.md' });
  });

  it('passes the read cap to the file system', async () => {
    const fs = new FakeFileSystem({ '/d/a.md': 'x' });
    const seen: number[] = [];
    const spy = Object.assign(Object.create(fs) as FakeFileSystem, {
      readFile: (path: string, options: { maxBytes: number }) => (seen.push(options.maxBytes), fs.readFile(path, options)),
    });
    await read(spy, '/d/a.md');
    expect(seen).toEqual([READ_MAX_BYTES]);
  });
});
