import { describe, expect, it } from 'vitest';
import { appendedText, SentCopies, type ChainedHash, type SentCopy } from '../../../src/core/documents/incremental';
import type { Decode } from '../../../src/core/text/decode';

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);

const samePrefix = (prefix: Uint8Array, bytes: Uint8Array) => prefix.every((value, i) => bytes[i] === value);

/** A stand-in chained hash: the bytes seen so far, readable in expectations. */
const chained = (seen: readonly number[] = []): ChainedHash => ({
  update: (bytes) => chained([...seen, ...bytes]),
  digest: () => `#${seen.join('.')}`,
});

const utf8 = (text: string) => new TextEncoder().encode(text);

const copyOf = (bytes: Uint8Array, overrides: Partial<SentCopy> = {}): SentCopy => ({
  bytes,
  version: chained([...bytes]).digest(),
  state: chained([...bytes]),
  encoding: 'utf-8',
  bom: false,
  guessed: false,
  endsClean: true,
  lines: { crlf: 0, lf: 0 },
  endsWithCr: false,
  ...overrides,
});

const append = (copy: SentCopy, bytes: Uint8Array) => appendedText(copy, bytes, { decode, samePrefix });

describe('appendedText', () => {
  it('gives the new bytes of a grown file as text when its start is unchanged', () => {
    const result = append(copyOf(utf8('line 1\n')), utf8('line 1\nline 2\n'));
    expect(result?.text).toBe('line 2\n');
  });

  it('gives an empty append when the file is unchanged', () => {
    expect(append(copyOf(utf8('line 1\n')), utf8('line 1\n'))?.text).toBe('');
  });

  it('gives nothing when the start changed: an edit in place that also grew the file', () => {
    expect(append(copyOf(utf8('line 1\nline 2\n')), utf8('line 1\nnew\nline 2\n'))).toBeNull();
  });

  it('gives nothing when the file got shorter', () => {
    expect(append(copyOf(utf8('line 1\nline 2\n')), utf8('line 1\n'))).toBeNull();
  });

  it('gives nothing when the new UTF-8 bytes are not valid on their own', () => {
    // The copy ends inside "é" (C3 A9): the new bytes start with its second byte.
    const copy = copyOf(Uint8Array.from([0x61, 0xc3]), { endsClean: true });
    expect(append(copy, Uint8Array.from([0x61, 0xc3, 0xa9, 0x0a]))).toBeNull();
  });

  it('gives nothing when the shown text ended in a replacement character (a write caught mid-character)', () => {
    expect(append(copyOf(utf8('a'), { endsClean: false }), utf8('ab'))).toBeNull();
  });

  it('decodes UTF-16 from an even offset, and gives nothing from an odd one', () => {
    const le = (text: string) => Uint8Array.from([...text].flatMap((char) => [char.charCodeAt(0), 0]));
    const bom = Uint8Array.from([0xff, 0xfe]);
    const copy = copyOf(Uint8Array.from([...bom, ...le('a\n')]), { encoding: 'utf-16le', bom: true });
    expect(append(copy, Uint8Array.from([...bom, ...le('a\nb\n')]))?.text).toBe('b\n');
    const odd = copyOf(Uint8Array.from([...bom, ...le('a\n'), 0x62]), { encoding: 'utf-16le', bom: true });
    expect(append(odd, Uint8Array.from([...bom, ...le('a\n'), 0x62, 0x00]))).toBeNull();
  });

  it('decodes a chosen Windows-1252 file, but gives nothing for a guessed encoding or UTF-32', () => {
    const latin = (text: string) => Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
    expect(append(copyOf(latin('a\n'), { encoding: 'windows-1252' }), latin('a\n\xe9\n'))?.text).toBe('\u00e9\n');
    expect(append(copyOf(latin('a\n'), { encoding: 'windows-1252', guessed: true }), latin('a\n\xe9\n'))).toBeNull();
    expect(append(copyOf(Uint8Array.from([0x61, 0, 0, 0]), { encoding: 'utf-32le' }), Uint8Array.from([0x61, 0, 0, 0, 0x62, 0, 0, 0]))).toBeNull();
  });

  it('gives the version of the whole file, and a state that goes on from it', () => {
    const copy = copyOf(utf8('a\n'));
    const result = append(copy, utf8('a\nb\n'));
    expect(result?.copy.version).toBe(chained([...utf8('a\nb\n')]).digest());
    expect(result?.copy.state.update(utf8('c')).digest()).toBe(chained([...utf8('a\nb\nc')]).digest());
    expect(result?.copy.bytes).toEqual(utf8('a\nb\n'));
  });
});

describe('appendedText: the next copy', () => {
  it('adds the new line endings to the counts, a CRLF split across the two reads included', () => {
    const copy = copyOf(utf8('a\r\nb\r'), { lines: { crlf: 1, lf: 0 }, endsWithCr: true });
    const result = append(copy, utf8('a\r\nb\r\nc\nd'));
    expect(result?.copy.lines).toEqual({ crlf: 2, lf: 1 });
    expect(result?.copy.endsWithCr).toBe(false);
  });

  it('marks a copy whose text ends in a replacement character, so the next change is a full read', () => {
    const copy = copyOf(utf8('a'), { encoding: 'windows-1252' });
    // Windows-1252 has no replacement character of its own: a decoded U+FFFD can only come from a UTF-16 cut.
    const le = copyOf(Uint8Array.from([0x61, 0x00]), { encoding: 'utf-16le' });
    expect(append(le, Uint8Array.from([0x61, 0x00, 0x3d, 0xd8]))?.copy.endsClean).toBe(false);
    expect(append(copy, utf8('ab'))?.copy.endsClean).toBe(true);
  });
});

describe('SentCopies', () => {
  const sized = (size: number) => copyOf(new Uint8Array(size));

  it('keeps a copy only of a file at least the minimum size', () => {
    const copies = new SentCopies({ minBytes: 10, maxTotalBytes: 100 });
    copies.keep('small', sized(9));
    copies.keep('large', sized(10));
    expect(copies.get('small')).toBeNull();
    expect(copies.get('large')?.bytes.byteLength).toBe(10);
  });

  it('replaces a tab\'s copy, and drops it when the tab no longer has one to keep', () => {
    const copies = new SentCopies({ minBytes: 10, maxTotalBytes: 100 });
    copies.keep('a', sized(20));
    copies.keep('a', sized(30));
    expect(copies.get('a')?.bytes.byteLength).toBe(30);
    copies.keep('a', sized(5));
    expect(copies.get('a')).toBeNull();
    copies.keep('a', sized(20));
    copies.forget('a');
    expect(copies.get('a')).toBeNull();
  });

  it('drops the least recently read copies to stay within the total', () => {
    const copies = new SentCopies({ minBytes: 10, maxTotalBytes: 100 });
    copies.keep('a', sized(40));
    copies.keep('b', sized(40));
    copies.get('a');
    copies.keep('c', sized(40));
    expect(copies.get('b')).toBeNull();
    expect(copies.get('a')).not.toBeNull();
    expect(copies.get('c')).not.toBeNull();
  });

  it('never keeps a copy larger than the total', () => {
    const copies = new SentCopies({ minBytes: 10, maxTotalBytes: 100 });
    copies.keep('a', sized(40));
    copies.keep('huge', sized(101));
    expect(copies.get('huge')).toBeNull();
    expect(copies.get('a')).not.toBeNull();
  });
});
