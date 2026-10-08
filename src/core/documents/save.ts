import type { SaveResult } from '../../shared/documents';
import { FsError, type FileSystem } from '../ports';
import { decodeText, type Decode, type WhatwgEncoding } from '../text/decode';
import { encodeText, lineEndingOf } from '../text/encode';
import { READ_MAX_BYTES, type Hash } from './read';

/**
 * Saves a document's edited text (ADR-013, SR-15), only if the file is still the version the
 * page loaded (`base`, its content hash): then its bytes are the ones the page's text came from,
 * so they give the encoding, byte order mark and line endings to write back. Otherwise nothing is
 * written and the page is told what is there now.
 */
export async function saveDocument(
  { fs, decode, hash }: { fs: FileSystem; decode: Decode; hash: Hash },
  { path, text, base, encoding }: { path: string; text: string; base: string; encoding?: WhatwgEncoding | undefined },
): Promise<Exclude<SaveResult, { kind: 'refused' }>> {
  let current: Uint8Array;
  try {
    current = await fs.readFile(path, { maxBytes: READ_MAX_BYTES });
  } catch (error) {
    if (error instanceof FsError && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return { kind: 'conflict', version: null };
    return failed(error);
  }
  const version = hash(current);
  if (version !== base) return { kind: 'conflict', version };
  const decoded = decodeText(current, decode, encoding);
  const target =
    decoded.kind === 'text'
      ? { encoding: decoded.encoding, bom: decoded.bom, lineEnding: lineEndingOf(decoded.text) }
      : { encoding: 'utf-8' as const, bom: false, lineEnding: 'lf' as const };
  const encoded = encodeText(text, target, decode);
  if (encoded.kind === 'unencodable') return encoded;
  try {
    await fs.saveFile(path, encoded.bytes);
  } catch (error) {
    return failed(error);
  }
  return { kind: 'saved', version: hash(encoded.bytes) };
}

function failed(error: unknown): { kind: 'failed'; reason: 'no-permission' | 'not-a-file' | 'unavailable' } {
  if (!(error instanceof FsError)) throw error;
  const reason = error.code === 'EACCES' ? 'no-permission' : error.code === 'EISDIR' || error.code === 'ENOTFILE' ? 'not-a-file' : 'unavailable';
  return { kind: 'failed', reason };
}
