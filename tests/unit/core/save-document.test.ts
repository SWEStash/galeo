import { describe, expect, it } from 'vitest';
import { saveDocument } from '../../../src/core/documents/save';
import { FsError } from '../../../src/core/ports';
import type { Decode } from '../../../src/core/text/decode';
import type { Target } from '../../../src/core/text/encode';
import { FakeFileSystem } from '../../helpers/fakes/file-system';

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);
/** A stand-in content hash: the bytes themselves. */
const hash = (bytes: Uint8Array) => `#${[...bytes].join('.')}`;
const utf8 = (text: string) => new TextEncoder().encode(text);

async function bytesOf(fs: FakeFileSystem, path: string): Promise<number[]> {
  return [...(await fs.readFile(path, { maxBytes: 1 << 20 }))];
}

function save(fs: FakeFileSystem, text: string, base: string | null, encoding?: 'windows-1252', shape?: Target) {
  return saveDocument({ fs, decode, hash }, { path: '/d/a.md', text, base, encoding, shape });
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

  describe('with no base (the file was gone when the reader chose to save it again)', () => {
    it('writes the file again, in the shape of its last read: encoding, byte order mark and line endings', async () => {
      const fs = new FakeFileSystem({});
      const result = await save(fs, 'a\nb\n', null, undefined, { encoding: 'utf-16le', bom: true, lineEnding: 'crlf' });
      const bytes = [0xff, 0xfe, ...[...'a\r\nb\r\n'].flatMap((c) => [c.charCodeAt(0), 0])];
      expect(result).toEqual({ kind: 'saved', version: hash(Uint8Array.from(bytes)) });
      expect(await bytesOf(fs, '/d/a.md')).toEqual(bytes);
    });

    it('takes the encoding the reader chose over the last read, without a byte order mark of another encoding', async () => {
      const fs = new FakeFileSystem({});
      await save(fs, 'é\n', null, 'windows-1252', { encoding: 'utf-8', bom: true, lineEnding: 'crlf' });
      expect(await bytesOf(fs, '/d/a.md')).toEqual([0xe9, 0x0d, 0x0a]);
    });

    it('writes UTF-8 with LF when nothing was read', async () => {
      const fs = new FakeFileSystem({});
      await save(fs, 'é\r\n', null);
      expect(await bytesOf(fs, '/d/a.md')).toEqual([0xc3, 0xa9, 0x0a]);
    });

    it('refuses when a file is there again, naming its version, and writes nothing', async () => {
      const fs = new FakeFileSystem({ '/d/a.md': 'back\n' });
      expect(await save(fs, 'mine\n', null)).toEqual({ kind: 'conflict', version: hash(utf8('back\n')) });
      expect(fs.saves).toEqual([]);
    });

    it("refuses text the shape's encoding can't hold", async () => {
      const fs = new FakeFileSystem({});
      expect(await save(fs, '😀', null, undefined, { encoding: 'windows-1252', bom: false, lineEnding: 'lf' })).toEqual({
        kind: 'unencodable',
        character: '😀',
        line: 1,
      });
      expect(fs.saves).toEqual([]);
    });
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

  describe('the size cap counts the bytes written, not the characters', () => {
    const capped = (fs: FakeFileSystem, text: string, base: string | null, maxBytes: number) =>
      saveDocument({ fs, decode, hash, maxBytes }, { path: '/d/a.md', text, base });

    it('refuses UTF-8 text whose bytes exceed the cap though its characters fit, and writes nothing', async () => {
      const fs = new FakeFileSystem({ '/d/a.md': 'old\n' });
      // Four characters, eight bytes in UTF-8.
      expect(await capped(fs, 'éééé', hash(utf8('old\n')), 7)).toEqual({ kind: 'failed', reason: 'too-large' });
      expect(fs.saves).toEqual([]);
    });

    it('writes text whose bytes are exactly the cap', async () => {
      const fs = new FakeFileSystem({ '/d/a.md': 'old\n' });
      expect(await capped(fs, 'éééé', hash(utf8('old\n')), 8)).toEqual({ kind: 'saved', version: hash(utf8('éééé')) });
    });

    it('counts a UTF-16 file at two bytes a character, plus its byte order mark', async () => {
      const utf16 = new Uint8Array([0xff, 0xfe, 0x6f, 0x00, 0x0a, 0x00]);
      const fs = new FakeFileSystem({ '/d/a.md': utf16 });
      const base = hash(utf16);
      expect(await capped(fs, 'abc', base, 7)).toEqual({ kind: 'failed', reason: 'too-large' });
      expect(await capped(fs, 'abc', base, 8)).toMatchObject({ kind: 'saved' });
    });
  });
});
