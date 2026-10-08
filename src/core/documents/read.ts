import { READ_MAX_BYTES, type DocumentContent } from '../../shared/documents';
import { chooseView, detectFormat } from '../formats/registry';
import { FsError, type FileSystem } from '../ports';
import { decodeText, type Decode, type WhatwgEncoding } from '../text/decode';

/** A content hash of a file's bytes (main's SHA-256), injected so core stays free of runtime modules. */
export type Hash = (bytes: Uint8Array) => string;

export { READ_MAX_BYTES };

const STATE_BY_CODE = {
  ENOENT: 'missing',
  ENOTDIR: 'missing',
  EACCES: 'no-permission',
  EISDIR: 'not-a-file',
  ENOTFILE: 'not-a-file',
  EOTHER: 'unreadable',
} as const;

/**
 * Reads a document for display: its text, format and opening view, or the state to show
 * instead (UX §4). Every file-system failure becomes a state, never an error.
 */
export async function readDocument(
  path: string,
  {
    fs,
    decode,
    hash,
    renderAnyway = false,
    encoding,
  }: { fs: FileSystem; decode: Decode; hash: Hash; renderAnyway?: boolean; encoding?: WhatwgEncoding | undefined },
): Promise<DocumentContent> {
  let bytes: Uint8Array;
  try {
    bytes = await fs.readFile(path, { maxBytes: READ_MAX_BYTES });
  } catch (error) {
    if (!(error instanceof FsError)) throw error;
    if (error.code === 'ETOOBIG') return { state: 'too-large', path, maxBytes: READ_MAX_BYTES };
    return { state: STATE_BY_CODE[error.code], path };
  }
  const format = detectFormat(path);
  if (bytes.byteLength === 0) return { state: 'empty', path, format };
  const decoded = decodeText(bytes, decode, encoding);
  if (decoded.kind === 'binary') return { state: 'binary', path, size: bytes.byteLength };
  const { view, banner } = chooseView(format, { size: bytes.byteLength, renderAnyway });
  return {
    state: 'ready',
    path,
    format,
    view,
    banner,
    text: decoded.text,
    encoding: decoded.encoding,
    guessedEncoding: decoded.guessed,
    size: bytes.byteLength,
    version: hash(bytes),
  };
}
