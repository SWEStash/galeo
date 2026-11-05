import type { TaskToggleResult } from '../../shared/documents';
import type { WorkerFormat } from '../../shared/formats';
import type { References } from '../../shared/markdown/references';
import { flipTaskBox } from '../../shared/markdown/task-box';
import { FsError, type FileSystem } from '../ports';
import { decodeText, type Decode, type WhatwgEncoding } from '../text/decode';
import { READ_MAX_BYTES, type Hash } from './read';
import { saveDocument, targetOf } from './save';
import { encodeText } from '../text/encode';

type Ticked = Exclude<TaskToggleResult, { kind: 'refused'; reason: 'no-input' | 'editing' }>;

/**
 * Flips the task box on `line` of a file while the reader reads it (ADR-031): only if the file is
 * still the version the page read (`base`), only on a line main's own parse of it shows as a task
 * item and whose text starts with one, then saved as a save is (SR-15).
 */
export async function toggleTaskBox(
  deps: { fs: FileSystem; decode: Decode; hash: Hash; references: (text: string, format: WorkerFormat) => Promise<References | null> },
  { path, line, base, encoding, format }: { path: string; line: number; base: string; encoding?: WhatwgEncoding | undefined; format: WorkerFormat },
): Promise<Ticked> {
  let bytes: Uint8Array;
  try {
    bytes = await deps.fs.readFile(path, { maxBytes: READ_MAX_BYTES });
  } catch (error) {
    if (error instanceof FsError) return { kind: 'conflict', version: null };
    throw error;
  }
  const version = deps.hash(bytes);
  if (version !== base) return { kind: 'conflict', version };
  const decoded = decodeText(bytes, deps.decode, encoding);
  if (decoded.kind !== 'text') return { kind: 'refused', reason: 'not-a-task' };
  // A save writes the whole text again, in one kind of line ending and the encoding of record. Only
  // a file that comes back byte for byte keeps everything but the box (mixed or bare-CR line
  // endings and unreadable bytes don't): any other is refused, not rewritten.
  const again = encodeText(decoded.text, targetOf(bytes, deps.decode, encoding), deps.decode);
  if (again.kind !== 'bytes' || !sameBytes(again.bytes, bytes)) return { kind: 'refused', reason: 'not-in-place' };
  const references = await deps.references(decoded.text, format);
  if (!references) return { kind: 'refused', reason: 'unavailable' };
  const lines = decoded.text.split('\n');
  const flipped = references.tasks.includes(line) ? flipTaskBox(lines[line - 1] ?? '') : null;
  if (flipped === null) return { kind: 'refused', reason: 'not-a-task' };
  lines[line - 1] = flipped;
  return saveDocument({ fs: deps.fs, decode: deps.decode, hash: deps.hash }, { path, text: lines.join('\n'), base, encoding });
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, at) => byte === b[at]);
