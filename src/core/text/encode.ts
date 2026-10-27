import type { Decode, TextEncoding } from './decode';

type LineEnding = 'lf' | 'crlf';

/** How a file's text goes back to bytes: as it was read (ADR-013). */
export interface Target {
  encoding: TextEncoding;
  bom: boolean;
  lineEnding: LineEnding;
}

type Encoded =
  | { kind: 'bytes'; bytes: Uint8Array }
  /** The first character the encoding can't hold, and its line (from 1): nothing is written. */
  | { kind: 'unencodable'; character: string; line: number };

const BOM: Record<TextEncoding, readonly number[]> = {
  'utf-8': [0xef, 0xbb, 0xbf],
  'utf-16le': [0xff, 0xfe],
  'utf-16be': [0xfe, 0xff],
  'utf-32le': [0xff, 0xfe, 0x00, 0x00],
  'utf-32be': [0x00, 0x00, 0xfe, 0xff],
  'windows-1252': [],
};

/** CRLF when more lines end with it than with a bare LF; a file without breaks is LF. */
export function lineEndingOf(text: string): LineEnding {
  let crlf = 0;
  let lf = 0;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) {
    if (at > 0 && text[at - 1] === '\r') crlf++;
    else lf++;
  }
  return crlf > lf ? 'crlf' : 'lf';
}

/**
 * Encodes edited text the way its file was read: same encoding, byte order mark and line
 * endings. Windows-1252 is mapped through the platform decoder itself, so a save writes back
 * exactly the bytes a read turns into these characters.
 */
export function encodeText(text: string, target: Target, decode: Decode): Encoded {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = target.lineEnding === 'crlf' ? normalized.replaceAll('\n', '\r\n') : normalized;
  let line = 1;
  const windows1252 = target.encoding === 'windows-1252' ? windows1252Bytes(decode) : null;
  for (const character of lines) {
    if (character === '\n') line++;
    const point = character.codePointAt(0)!;
    const lone = point >= 0xd800 && point <= 0xdfff;
    if (lone || (windows1252 && !windows1252.has(character))) return { kind: 'unencodable', character, line };
  }
  const body = encodeChecked(lines, target.encoding, windows1252);
  const mark = target.bom ? BOM[target.encoding] : [];
  const bytes = new Uint8Array(mark.length + body.length);
  bytes.set(mark);
  bytes.set(body, mark.length);
  return { kind: 'bytes', bytes };
}

/** Encodes text already checked to be encodable. */
function encodeChecked(text: string, encoding: TextEncoding, windows1252: Map<string, number> | null): Uint8Array {
  switch (encoding) {
    case 'utf-8': {
      const bytes: number[] = [];
      for (const character of text) {
        const point = character.codePointAt(0)!;
        if (point < 0x80) bytes.push(point);
        else if (point < 0x800) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
        else if (point < 0x10000) bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
        else bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
      }
      return Uint8Array.from(bytes);
    }
    case 'windows-1252':
      return Uint8Array.from(text, (character) => windows1252!.get(character)!);
    case 'utf-16le':
    case 'utf-16be': {
      const view = new DataView(new ArrayBuffer(text.length * 2));
      for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), encoding === 'utf-16le');
      return new Uint8Array(view.buffer);
    }
    case 'utf-32le':
    case 'utf-32be': {
      const points = Array.from(text, (character) => character.codePointAt(0)!);
      const view = new DataView(new ArrayBuffer(points.length * 4));
      points.forEach((point, i) => view.setUint32(i * 4, point, encoding === 'utf-32le'));
      return new Uint8Array(view.buffer);
    }
  }
}

const windows1252Tables = new WeakMap<Decode, Map<string, number>>();

/** Character → byte for Windows-1252, read off the decoder (every byte maps to one character). */
function windows1252Bytes(decode: Decode): Map<string, number> {
  let table = windows1252Tables.get(decode);
  if (!table) {
    table = new Map();
    for (let byte = 0; byte < 256; byte++) {
      const character = decode(Uint8Array.of(byte), 'windows-1252', { fatal: false });
      if (!table.has(character)) table.set(character, byte);
    }
    windows1252Tables.set(decode, table);
  }
  return table;
}
