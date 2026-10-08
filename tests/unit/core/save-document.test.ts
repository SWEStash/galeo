import { describe, expect, it } from 'vitest';
import { saveDocument } from '../../../src/core/documents/save';
import { FsError } from '../../../src/core/ports';
import type { Decode } from '../../../src/core/text/decode';
import { FakeFileSystem } from '../../helpers/fakes/file-system';

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);
/** A stand-in content hash: the bytes themselves. */
const hash = (bytes: Uint8Array) => `#${[...bytes].join('.')}`;
const utf8 = (text: string) => new TextEncoder().encode(text);

async function bytesOf(fs: FakeFileSystem, path: string): Promise<number[]> {
  return [...(await fs.readFile(path, { maxBytes: 1 << 20 }))];
}

function save(fs: FakeFileSystem, text: string, base: string, encoding?: 'windows-1252') {
  return saveDocument({ fs, decode, hash }, { path: '/d/a.md', text, base, encoding });
}

describe('saveDocument', () => {
  it('writes the text when the file is still the version the page loaded, and names the new version', async () => {
    const fs = new FakeFileSystem({ '/d/a.md': 'old\n' });
    const result = await save(fs, 'new\n', hash(utf8('old\n')));
    expect(result).toEqual({ kind: 'saved', version: hash(utf8('new\n')) });
    expect(await bytesOf(fs, '/d/a.md')).toEqual([...utf8('new\n')]);
  });

  it('refuses when the file changed since, naming what is there now, and writes nothing', async () => {
    const fs = new FakeFileSystem({ '/d/a.md': 'theirs\n' });
    expect(await save(fs, 'mine\n', hash(utf8('old\n')))).toEqual({ kind: 'conflict', version: hash(utf8('theirs\n')) });
    expect(await bytesOf(fs, '/d/a.md')).toEqual([...utf8('theirs\n')]);
    expect(fs.saves).toEqual([]);
  });

  it('refuses when the file is gone, as a conflict with no version', async () => {
    const fs = new FakeFileSystem({});
    expect(await save(fs, 'mine\n', hash(utf8('old\n')))).toEqual({ kind: 'conflict', version: null });
    expect(fs.saves).toEqual([]);
  });

  it("keeps the file's byte order mark and CRLF line endings", async () => {
    const old = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('a\r\nb\r\n')]);
    const fs = new FakeFileSystem({ '/d/a.md': old });
    await save(fs, 'a\nb\nc\n', hash(old));
    expect(await bytesOf(fs, '/d/a.md')).toEqual([0xef, 0xbb, 0xbf, ...utf8('a\r\nb\r\nc\r\n')]);
  });

  it('keeps a guessed Windows-1252 file in Windows-1252, and the encoding the reader chose', async () => {
    const latin = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]);
    const fs = new FakeFileSystem({ '/d/a.md': latin });
    await save(fs, 'café €', hash(latin));
    expect(await bytesOf(fs, '/d/a.md')).toEqual([0x63, 0x61, 0x66, 0xe9, 0x20, 0x80]);

    const plain = utf8('abc');
    fs.write('/d/a.md', plain);
    await save(fs, 'é', hash(plain), 'windows-1252');
    expect(await bytesOf(fs, '/d/a.md')).toEqual([0xe9]);
  });

  it("refuses text the file's encoding can't hold, naming the character, and writes nothing", async () => {
    const latin = Uint8Array.from([0xe9]);
    const fs = new FakeFileSystem({ '/d/a.md': latin });
    expect(await save(fs, 'é\n😀', hash(latin))).toEqual({ kind: 'unencodable', character: '😀', line: 2 });
    expect(fs.saves).toEqual([]);
  });

  it('reports a write the file system refuses', async () => {
    const fs = new (class extends FakeFileSystem {
      override async saveFile(path: string): Promise<'replaced'> {
        throw new FsError('EACCES', path);
      }
    })({ '/d/a.md': 'old' });
    expect(await save(fs, 'new', hash(utf8('old')))).toEqual({ kind: 'failed', reason: 'no-permission' });
  });
});
