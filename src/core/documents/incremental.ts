import type { TextEncoding } from '../../shared/documents';
import type { Decode } from '../text/decode';
import { lineEndingCounts } from '../text/encode';

/** A content hash that can go on from where it stopped: `update` returns a new state, leaving this one as it was. */
export interface ChainedHash {
  update(bytes: Uint8Array): ChainedHash;
  digest(): string;
}

/** What main last sent a tab (ADR-033): the bytes, their version and decoding, and the hash state after them. */
export interface SentCopy {
  bytes: Uint8Array;
  version: string;
  state: ChainedHash;
  encoding: TextEncoding;
  bom: boolean;
  guessed: boolean;
  /** The shown text doesn't end in U+FFFD, so the bytes don't stop inside a character. */
  endsClean: boolean;
  /** How many lines end in CRLF and in LF alone: the line ending a save keeps (ADR-013). */
  lines: { crlf: number; lf: number };
  /** The shown text ends in CR, so a new text starting with LF ends a CRLF line. */
  endsWithCr: boolean;
}

/**
 * The text of a grown file's new bytes, and the copy that replaces `copy` (the whole file's bytes, version and
 * counts), or null when only a full read is exact: the start changed, the file got shorter, or the new bytes
 * can't be decoded alone.
 */
export function appendedText(
  copy: SentCopy,
  bytes: Uint8Array,
  { decode, samePrefix }: { decode: Decode; samePrefix: (prefix: Uint8Array, bytes: Uint8Array) => boolean },
): { text: string; copy: SentCopy } | null {
  if (bytes.byteLength < copy.bytes.byteLength || !samePrefix(copy.bytes, bytes)) return null;
  const tail = bytes.subarray(copy.bytes.byteLength);
  const text = decodeTail(copy, tail, decode);
  if (text === null) return null;
  const state = copy.state.update(tail);
  const added = lineEndingCounts(text, copy.endsWithCr);
  return {
    text,
    copy: {
      ...copy,
      bytes,
      version: state.digest(),
      state,
      endsClean: text === '' ? copy.endsClean : !text.endsWith('\uFFFD'),
      lines: { crlf: copy.lines.crlf + added.crlf, lf: copy.lines.lf + added.lf },
      endsWithCr: text === '' ? copy.endsWithCr : text.endsWith('\r'),
    },
  };
}

/**
 * The new bytes' text, only when it is the text a full decode would give them: never for a guessed encoding
 * (the guess could change) or UTF-32 (decoded by hand, rare), nor after a character cut in two. UTF-8 must be
 * valid on its own; UTF-16 must start on a code unit; Windows-1252 maps each byte alone.
 */
function decodeTail(copy: SentCopy, tail: Uint8Array, decode: Decode): string | null {
  if (copy.guessed || !copy.endsClean) return null;
  switch (copy.encoding) {
    case 'utf-8':
      try {
        return decode(tail, 'utf-8', { fatal: true });
      } catch {
        return null;
      }
    case 'utf-16le':
    case 'utf-16be':
      return copy.bytes.byteLength % 2 === 0 && tail.byteLength % 2 === 0 ? decode(tail, copy.encoding, { fatal: false }) : null;
    case 'windows-1252':
      return decode(tail, 'windows-1252', { fatal: false });
    default:
      return null;
  }
}

/**
 * The copies main keeps of what it last sent each tab (ADR-033): only of files of at least `minBytes`, and at
 * most `maxTotalBytes` for all tabs, dropping the least recently read first.
 */
export class SentCopies {
  // A Map keeps insertion order: re-inserting on each read keeps the least recently read first.
  private readonly copies = new Map<string, SentCopy>();
  private total = 0;

  constructor(private readonly limits: { minBytes: number; maxTotalBytes: number }) {}

  get(id: string): SentCopy | null {
    const copy = this.copies.get(id);
    if (!copy) return null;
    this.copies.delete(id);
    this.copies.set(id, copy);
    return copy;
  }

  keep(id: string, copy: SentCopy): void {
    this.forget(id);
    const size = copy.bytes.byteLength;
    if (size < this.limits.minBytes || size > this.limits.maxTotalBytes) return;
    for (const oldest of this.copies.keys()) {
      if (this.total + size <= this.limits.maxTotalBytes) break;
      this.forget(oldest);
    }
    this.copies.set(id, copy);
    this.total += size;
  }

  forget(id: string): void {
    const copy = this.copies.get(id);
    if (!copy) return;
    this.copies.delete(id);
    this.total -= copy.bytes.byteLength;
  }
}
