import type { SaveResult } from '../../shared/documents';
import { FsError, type FileSystem } from '../ports';
import { decodeText, type Decode, type WhatwgEncoding } from '../text/decode';
import { encodeText, lineEndingOf, type Target } from '../text/encode';
import { READ_MAX_BYTES, type Hash } from './read';

/**
 * Saves a document's edited text (ADR-013, SR-15), only if the file is still the version the
 * page loaded (`base`, its content hash): then its bytes are the ones the page's text came from,
 * so they give the encoding, byte order mark and line endings to write back. Otherwise nothing is
 * written and the page is told what is there now. With no `base`, the reader saves a file that was
 * gone: it is written only if it's still gone, in the `shape` of its last read. Text that would
 * write more bytes than a read takes (`maxBytes`) isn't written: the channel's cap counts characters.
 */
export async function saveDocument(
  { fs, decode, hash, maxBytes = READ_MAX_BYTES }: { fs: FileSystem; decode: Decode; hash: Hash; maxBytes?: number },
  {
    path,
    text,
    base,
    encoding,
    shape,
  }: { path: string; text: string; base: string | null; encoding?: WhatwgEncoding | undefined; shape?: Target | null | undefined },
): Promise<Exclude<SaveResult, { kind: 'refused' }>> {
  let current: Uint8Array | null;
  try {
    current = await fs.readFile(path, { maxBytes: READ_MAX_BYTES });
  } catch (error) {
    if (!(error instanceof FsError && (error.code === 'ENOENT' || error.code === 'ENOTDIR'))) return failed(error);
    if (base !== null) return { kind: 'conflict', version: null };
    current = null;
  }
  const version = current && hash(current);
  if (version !== base) return { kind: 'conflict', version };
  const target = current ? targetOf(current, decode, encoding) : absentTarget(shape ?? null, encoding);
  const encoded = encodeText(text, target, decode);
  if (encoded.kind === 'unencodable') return encoded;
  if (encoded.bytes.length > maxBytes) return { kind: 'failed', reason: 'too-large' };
  try {
    await fs.saveFile(path, encoded.bytes);
  } catch (error) {
    return failed(error);
  }
  return { kind: 'saved', version: hash(encoded.bytes) };
}

/** The shape of the text in a file's bytes: the encoding of record, its byte order mark, its line endings. */
function targetOf(bytes: Uint8Array, decode: Decode, encoding?: WhatwgEncoding): Target {
  const decoded = decodeText(bytes, decode, encoding);
  return decoded.kind === 'text'
    ? { encoding: decoded.encoding, bom: decoded.bom, lineEnding: lineEndingOf(decoded.text) }
    : { encoding: 'utf-8', bom: false, lineEnding: 'lf' };
}

/** A file written again: as last read (or UTF-8 with LF), in the encoding the reader chose if any. */
function absentTarget(shape: Target | null, chosen: WhatwgEncoding | undefined): Target {
  const read = shape ?? { encoding: 'utf-8', bom: false, lineEnding: 'lf' };
  if (!chosen || chosen === read.encoding) return read;
  return { encoding: chosen, bom: false, lineEnding: read.lineEnding };
}

function failed(error: unknown): { kind: 'failed'; reason: 'no-permission' | 'not-a-file' | 'unavailable' } {
  if (!(error instanceof FsError)) throw error;
  const reason = error.code === 'EACCES' ? 'no-permission' : error.code === 'EISDIR' || error.code === 'ENOTFILE' ? 'not-a-file' : 'unavailable';
  return { kind: 'failed', reason };
}
