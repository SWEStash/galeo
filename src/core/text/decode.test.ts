import { describe, expect, it } from 'vitest';
import { decodeText, type Decode } from './decode';

// Core's typecheck has no platform globals; the test runs on Node, which has both.
declare const TextDecoder: new (label: string, options: { fatal: boolean; ignoreBOM: boolean }) => {
  decode(input: Uint8Array): string;
};
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

// The platform decoder main injects; WHATWG `TextDecoder` behaves the same in Node and Chromium.
const decode: Decode = (bytes, encoding, { fatal }) =>
  new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);

const bytes = (...values: number[]) => Uint8Array.from(values);
const utf8 = (text: string) => new TextEncoder().encode(text);
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));

function utf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), littleEndian);
  return out;
}

function utf32(text: string, littleEndian: boolean): Uint8Array {
  const points = [...text].map((char) => char.codePointAt(0)!);
  const out = new Uint8Array(points.length * 4);
  const view = new DataView(out.buffer);
  points.forEach((point, i) => view.setUint32(i * 4, point, littleEndian));
  return out;
}

describe('decodeText', () => {
  it('decodes valid UTF-8', () => {
    expect(decodeText(utf8('# Título ✓\n'), decode)).toEqual({
      kind: 'text',
      text: '# Título ✓\n',
      encoding: 'utf-8',
      bom: false,
      guessed: false,
    });
  });

  it('decodes an empty file as empty UTF-8 text', () => {
    expect(decodeText(new Uint8Array(), decode)).toMatchObject({ kind: 'text', text: '', encoding: 'utf-8' });
  });

  it('strips a UTF-8 byte order mark', () => {
    expect(decodeText(concat(bytes(0xef, 0xbb, 0xbf), utf8('hi')), decode)).toMatchObject({
      kind: 'text',
      text: 'hi',
      encoding: 'utf-8',
      bom: true,
    });
  });

  it.each([
    ['utf-16le', bytes(0xff, 0xfe), true],
    ['utf-16be', bytes(0xfe, 0xff), false],
  ] as const)('decodes %s marked by its byte order mark', (encoding, bom, littleEndian) => {
    expect(decodeText(concat(bom, utf16('a\nb ✓', littleEndian)), decode)).toMatchObject({
      kind: 'text',
      text: 'a\nb ✓',
      encoding,
      bom: true,
      guessed: false,
    });
  });

  it.each([
    ['utf-32le', bytes(0xff, 0xfe, 0x00, 0x00), true],
    ['utf-32be', bytes(0x00, 0x00, 0xfe, 0xff), false],
  ] as const)('decodes %s marked by its byte order mark, astral characters included', (encoding, bom, littleEndian) => {
    expect(decodeText(concat(bom, utf32('x 😀\n', littleEndian)), decode)).toMatchObject({
      kind: 'text',
      text: 'x 😀\n',
      encoding,
      bom: true,
    });
  });

  it('replaces out-of-range UTF-32 code points instead of failing', () => {
    const invalid = concat(bytes(0xff, 0xfe, 0x00, 0x00), bytes(0x00, 0x00, 0x11, 0x00), utf32('a', true));
    expect(decodeText(invalid, decode)).toMatchObject({ kind: 'text', text: '�a' });
  });

  it('falls back to Windows-1252 for invalid UTF-8, flagged as a guess', () => {
    // "café – ok" as saved by a Windows-1252 editor: é = 0xE9, en dash = 0x96.
    const latin = concat(utf8('caf'), bytes(0xe9, 0x20, 0x96), utf8(' ok\n'));
    expect(decodeText(latin, decode)).toEqual({
      kind: 'text',
      text: 'café – ok\n',
      encoding: 'windows-1252',
      bom: false,
      guessed: true,
    });
  });

  it('treats NUL bytes without a UTF-16/32 mark as binary', () => {
    expect(decodeText(concat(utf8('PK'), bytes(0x03, 0x04, 0x00, 0x00), utf8('rest')), decode)).toEqual({
      kind: 'binary',
    });
  });

  it('only sniffs the head of the file for NUL bytes', () => {
    const text = concat(utf8('a'.repeat(8192)), bytes(0x00));
    expect(decodeText(text, decode)).toMatchObject({ kind: 'text' });
  });

  it('treats invalid UTF-8 dense with control bytes as binary', () => {
    const noise = Uint8Array.from({ length: 512 }, (_, i) => [0x01, 0x02, 0x9d, 0x1f, 0xff][i % 5]!);
    expect(decodeText(noise, decode)).toEqual({ kind: 'binary' });
  });

  it('keeps a Windows-1252 log dense with escapes, tabs and line breaks as text', () => {
    const line = concat(bytes(0x1b), utf8('[1m'), bytes(0xe9, 0x1b), utf8('[0m'), bytes(0x09, 0x0b, 0x0c, 0x0d, 0x0a));
    expect(decodeText(concat(...Array.from({ length: 50 }, () => line)), decode)).toMatchObject({
      kind: 'text',
      encoding: 'windows-1252',
    });
  });

  it('keeps valid UTF-8 with terminal escape sequences as text', () => {
    expect(decodeText(utf8('\u001b[31mERROR\u001b[0m boom\r\n\tat x\f'), decode)).toMatchObject({
      kind: 'text',
      encoding: 'utf-8',
      guessed: false,
    });
  });
});

describe('decodeText with a chosen encoding (Reopen with encoding…)', () => {
  it('decodes with that encoding, without guessing', () => {
    const latin1 = new Uint8Array([0x43, 0x61, 0x66, 0xe9]);
    expect(decodeText(latin1, decode, 'utf-8')).toEqual({ kind: 'text', text: 'Caf�', encoding: 'utf-8', bom: false, guessed: false });
    expect(decodeText(latin1, decode, 'windows-1252')).toMatchObject({ text: 'Café', encoding: 'windows-1252', guessed: false });
  });

  it('drops a byte order mark of the chosen encoding, and keeps any other as text', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00]);
    expect(decodeText(utf16, decode, 'utf-16le')).toMatchObject({ text: 'A', bom: true });
    expect(decodeText(utf16, decode, 'windows-1252')).toMatchObject({ text: 'ÿþA\u0000', bom: false });
  });
});
