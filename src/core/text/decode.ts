import type { TextEncoding } from '../../shared/documents';

export type { TextEncoding };

/** A WHATWG encoding the platform decodes (`TextDecoder`); throws on invalid input when `fatal`. */
export type WhatwgEncoding = Exclude<TextEncoding, 'utf-32le' | 'utf-32be'>;

/** The platform's decoder, injected so core stays free of runtime globals. It must not strip BOMs. */
export type Decode = (bytes: Uint8Array, encoding: WhatwgEncoding, options: { fatal: boolean }) => string;

export type DecodedText =
  | {
      kind: 'text';
      text: string;
      encoding: TextEncoding;
      bom: boolean;
      /** Not valid UTF-8 and no byte order mark: the encoding is a fallback guess (UX banner). */
      guessed: boolean;
    }
  | { kind: 'binary' };

/** How much of the head is sniffed for binary content. */
const SNIFF_BYTES = 8192;

/**
 * Invalid UTF-8 whose sniffed head has more than this share of control bytes (other than tab,
 * line breaks, form feed and escape) is binary, not a Windows-1252 text file.
 */
const BINARY_CONTROL_RATIO = 0.1;

const BOMS: readonly { bytes: readonly number[]; encoding: TextEncoding }[] = [
  // UTF-32LE before UTF-16LE: its mark starts with the same two bytes.
  { bytes: [0xff, 0xfe, 0x00, 0x00], encoding: 'utf-32le' },
  { bytes: [0x00, 0x00, 0xfe, 0xff], encoding: 'utf-32be' },
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf-8' },
  { bytes: [0xff, 0xfe], encoding: 'utf-16le' },
  { bytes: [0xfe, 0xff], encoding: 'utf-16be' },
];

/**
 * Decodes a file's bytes: a byte order mark wins; otherwise NUL bytes mean binary, then strict
 * UTF-8, then a Windows-1252 fallback (every byte maps) unless the content looks binary.
 */
export function decodeText(bytes: Uint8Array, decode: Decode): DecodedText {
  const bom = BOMS.find((mark) => mark.bytes.every((value, i) => bytes[i] === value));
  if (bom) {
    const body = bytes.subarray(bom.bytes.length);
    const text =
      bom.encoding === 'utf-32le' || bom.encoding === 'utf-32be'
        ? decodeUtf32(body, bom.encoding === 'utf-32le')
        : decode(body, bom.encoding, { fatal: false });
    return { kind: 'text', text, encoding: bom.encoding, bom: true, guessed: false };
  }

  const head = bytes.subarray(0, SNIFF_BYTES);
  if (head.includes(0)) return { kind: 'binary' };
  try {
    return { kind: 'text', text: decode(bytes, 'utf-8', { fatal: true }), encoding: 'utf-8', bom: false, guessed: false };
  } catch {
    if (controlRatio(head) > BINARY_CONTROL_RATIO) return { kind: 'binary' };
    return {
      kind: 'text',
      text: decode(bytes, 'windows-1252', { fatal: false }),
      encoding: 'windows-1252',
      bom: false,
      guessed: true,
    };
  }
}

const TEXT_CONTROLS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1b]);

function controlRatio(head: Uint8Array): number {
  if (head.length === 0) return 0;
  let controls = 0;
  for (const value of head) if (value < 0x20 && !TEXT_CONTROLS.has(value)) controls++;
  return controls / head.length;
}

/** UTF-32 isn't a WHATWG encoding, so `TextDecoder` can't read it. Invalid units become U+FFFD. */
function decodeUtf32(body: Uint8Array, littleEndian: boolean): string {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const chunks: string[] = [];
  let points: number[] = [];
  for (let offset = 0; offset + 4 <= body.byteLength; offset += 4) {
    const point = view.getUint32(offset, littleEndian);
    const valid = point <= 0x10ffff && (point < 0xd800 || point > 0xdfff);
    points.push(valid ? point : 0xfffd);
    if (points.length === 4096) {
      chunks.push(String.fromCodePoint(...points));
      points = [];
    }
  }
  if (body.byteLength % 4 !== 0) points.push(0xfffd);
  chunks.push(String.fromCodePoint(...points));
  return chunks.join('');
}
