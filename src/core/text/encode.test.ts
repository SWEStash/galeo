import { describe, expect, it } from 'vitest';
import type { Decode } from './decode';
import { decodeText } from './decode';
import { encodeText, lineEndingOf } from './encode';

// Core's typecheck has no platform globals; the test runs on Node, which has both.
declare const TextDecoder: new (label: string, options: { fatal: boolean; ignoreBOM: boolean }) => {
  decode(input: Uint8Array): string;
};
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);
const bytes = (...values: number[]) => Uint8Array.from(values);

/** Encodes, then decodes the result the way a read would. */
function roundTrip(text: string, target: Parameters<typeof encodeText>[1]) {
  const result = encodeText(text, target, decode);
  if (result.kind !== 'bytes') throw new Error(`not encodable: ${JSON.stringify(result)}`);
  return { bytes: result.bytes, decoded: decodeText(result.bytes, decode) };
}

describe('lineEndingOf', () => {
  it('reads LF, CRLF, and the more common one in a mixed file', () => {
    expect(lineEndingOf('a\nb\n')).toBe('lf');
    expect(lineEndingOf('a\r\nb\r\n')).toBe('crlf');
    expect(lineEndingOf('a\r\nb\r\nc\n')).toBe('crlf');
    expect(lineEndingOf('a\nb\nc\r\n')).toBe('lf');
    expect(lineEndingOf('one line')).toBe('lf');
  });
});

describe('encodeText', () => {
  it('writes UTF-8 without a mark unless the file had one', () => {
    expect([...roundTrip('é', { encoding: 'utf-8', bom: false, lineEnding: 'lf' }).bytes]).toEqual([0xc3, 0xa9]);
    expect([...roundTrip('é', { encoding: 'utf-8', bom: true, lineEnding: 'lf' }).bytes]).toEqual([0xef, 0xbb, 0xbf, 0xc3, 0xa9]);
  });

  it('writes UTF-16 in its byte order, with its mark', () => {
    expect([...roundTrip('a€', { encoding: 'utf-16le', bom: true, lineEnding: 'lf' }).bytes]).toEqual([0xff, 0xfe, 0x61, 0x00, 0xac, 0x20]);
    expect([...roundTrip('a€', { encoding: 'utf-16be', bom: true, lineEnding: 'lf' }).bytes]).toEqual([0xfe, 0xff, 0x00, 0x61, 0x20, 0xac]);
    expect(roundTrip('😀', { encoding: 'utf-16le', bom: true, lineEnding: 'lf' }).decoded).toMatchObject({ text: '😀', encoding: 'utf-16le' });
  });

  it('writes UTF-32 in its byte order, with its mark', () => {
    expect([...roundTrip('😀', { encoding: 'utf-32le', bom: true, lineEnding: 'lf' }).bytes]).toEqual([0xff, 0xfe, 0x00, 0x00, 0x00, 0xf6, 0x01, 0x00]);
    expect(roundTrip('a😀', { encoding: 'utf-32be', bom: true, lineEnding: 'lf' }).decoded).toMatchObject({ text: 'a😀', encoding: 'utf-32be' });
  });

  it('writes Windows-1252 byte for byte, including the characters that differ from Latin-1', () => {
    const result = roundTrip('café €…', { encoding: 'windows-1252', bom: false, lineEnding: 'lf' });
    expect([...result.bytes]).toEqual([0x63, 0x61, 0x66, 0xe9, 0x20, 0x80, 0x85]);
  });

  it('refuses a character the encoding cannot hold, naming it and its line, and writes nothing', () => {
    expect(encodeText('ok\nsmile 😀 here', { encoding: 'windows-1252', bom: false, lineEnding: 'lf' }, decode)).toEqual({
      kind: 'unencodable',
      character: '😀',
      line: 2,
    });
  });

  it('refuses a lone surrogate in any encoding rather than writing a replacement', () => {
    expect(encodeText('a\uD800b', { encoding: 'utf-8', bom: false, lineEnding: 'lf' }, decode)).toMatchObject({ kind: 'unencodable', line: 1 });
  });

  it("writes the file's line endings, whatever the editor's text uses", () => {
    expect([...roundTrip('a\nb\r\nc', { encoding: 'utf-8', bom: false, lineEnding: 'crlf' }).bytes]).toEqual([...bytes(0x61, 0x0d, 0x0a, 0x62, 0x0d, 0x0a, 0x63)]);
    expect([...roundTrip('a\r\nb', { encoding: 'utf-8', bom: false, lineEnding: 'lf' }).bytes]).toEqual([0x61, 0x0a, 0x62]);
  });
});

describe('encodeText UTF-8', () => {
  it('writes every code point length the way the platform does', () => {
    const text = 'a ß € 😀 ߿ ࠀ ￿ \u{10ffff}';
    const result = encodeText(text, { encoding: 'utf-8', bom: false, lineEnding: 'lf' }, decode);
    expect(result).toEqual({ kind: 'bytes', bytes: new TextEncoder().encode(text) });
  });
});
