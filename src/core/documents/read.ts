import { READ_MAX_BYTES, type ReadReply } from '../../shared/documents';
import { chooseView, detectFormat } from '../formats/registry';
import { FsError, type FileSystem } from '../ports';
import { decodeText, type Decode, type WhatwgEncoding } from '../text/decode';
import { lineEndingCounts, majorityEnding, type Target } from '../text/encode';
import { appendedText, type ChainedHash, type SentCopy } from './incremental';

/** A content hash of a file's bytes (main's SHA-256), injected so core stays free of runtime modules. */
export type Hash = (bytes: Uint8Array) => string;

export { READ_MAX_BYTES };

/**
 * A re-read after a change (ADR-033): `copy` is what main last sent the tab, `held` the version the page says it
 * shows. `keep` receives the copy to keep next (null: none), `chain` hashes so the hash can go on later.
 */
interface IncrementalRead {
  copy: SentCopy | null;
  held: string | null;
  chain: (bytes: Uint8Array) => ChainedHash;
  samePrefix: (prefix: Uint8Array, bytes: Uint8Array) => boolean;
  keep: (copy: SentCopy | null) => void;
}

/** What the reader is told when a file can't be read, by the file system's reason. */
export const STATE_BY_CODE = {
  ENOENT: 'missing',
  ENOTDIR: 'missing',
  EACCES: 'no-permission',
  EISDIR: 'not-a-file',
  ENOTFILE: 'not-a-file',
  EOTHER: 'unreadable',
} as const;

/**
 * Reads a document for display: its text, format and opening view, or the state to show
 * instead (UX §4). Every file-system failure becomes a state, never an error. A shown text's
 * shape goes to `shaped`, so a file deleted while edited can be written back as it was.
 */
export async function readDocument(
  path: string,
  {
    fs,
    decode,
    hash,
    renderAnyway = false,
    encoding,
    shaped,
    incremental,
  }: {
    fs: FileSystem;
    decode: Decode;
    hash: Hash;
    renderAnyway?: boolean;
    encoding?: WhatwgEncoding | undefined;
    shaped?: (shape: Target) => void;
    incremental?: IncrementalRead;
  },
): Promise<ReadReply> {
  let bytes: Uint8Array;
  try {
    bytes = await fs.readFile(path, { maxBytes: READ_MAX_BYTES });
  } catch (error) {
    if (!(error instanceof FsError)) throw error;
    incremental?.keep(null);
    if (error.code === 'ETOOBIG') return { state: 'too-large', path, maxBytes: READ_MAX_BYTES };
    return { state: STATE_BY_CODE[error.code], path };
  }
  const format = detectFormat(path);
  const appended = incremental && appendTo(incremental, bytes, format, decode, renderAnyway);
  if (appended) {
    incremental.keep(appended.copy);
    const { encoding: kept, bom, lines } = appended.copy;
    shaped?.({ encoding: kept, bom, lineEnding: majorityEnding(lines) });
    return { state: 'appended', path, base: appended.base, text: appended.text, size: bytes.byteLength, version: appended.copy.version };
  }
  if (bytes.byteLength === 0) {
    incremental?.keep(null);
    return { state: 'empty', path, format };
  }
  const decoded = decodeText(bytes, decode, encoding);
  if (decoded.kind === 'binary') {
    incremental?.keep(null);
    return { state: 'binary', path, size: bytes.byteLength };
  }
  const lines = lineEndingCounts(decoded.text);
  shaped?.({ encoding: decoded.encoding, bom: decoded.bom, lineEnding: majorityEnding(lines) });
  const { view, banner } = chooseView(format, { size: bytes.byteLength, renderAnyway });
  let version: string;
  if (incremental) {
    const state = incremental.chain(bytes);
    version = state.digest();
    incremental.keep({
      bytes,
      version,
      state,
      encoding: decoded.encoding,
      bom: decoded.bom,
      guessed: decoded.guessed,
      endsClean: !decoded.text.endsWith('\uFFFD'),
      lines,
      endsWithCr: decoded.text.endsWith('\r'),
    });
  } else {
    version = hash(bytes);
  }
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
    version,
  };
}

/**
 * The append for a re-read, when the page holds the copy's version, the file only grew, and growing doesn't
 * change how it opens (a Markdown file past its render limit opens as source).
 */
function appendTo(
  { copy, held, samePrefix }: IncrementalRead,
  bytes: Uint8Array,
  format: ReturnType<typeof detectFormat>,
  decode: Decode,
  renderAnyway: boolean,
): { text: string; copy: SentCopy; base: string } | null {
  if (!copy || held !== copy.version) return null;
  const before = chooseView(format, { size: copy.bytes.byteLength, renderAnyway });
  const after = chooseView(format, { size: bytes.byteLength, renderAnyway });
  if (before.view !== after.view || before.banner !== after.banner) return null;
  const appended = appendedText(copy, bytes, { decode, samePrefix });
  return appended && { ...appended, base: copy.version };
}
