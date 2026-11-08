import { createHash, type Hash as NodeHash } from 'node:crypto';
import type { ChainedHash } from '../../core/documents/incremental';
import type { Hash } from '../../core/documents/read';

/** SHA-256 of a file's bytes, hex: the version a save names (ADR-013). */
export const sha256: Hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** SHA-256 that goes on from where it stopped (ADR-033): each step copies the state, so earlier ones stay usable. */
export function chainedSha256(bytes: Uint8Array): ChainedHash {
  return chained(createHash('sha256').update(bytes));
}

function chained(hash: NodeHash): ChainedHash {
  return {
    update: (bytes) => chained(hash.copy().update(bytes)),
    digest: () => hash.copy().digest('hex'),
  };
}

/** Whether `bytes` starts with `prefix`, byte for byte (ADR-033): Buffer's native compare, fast on large files. */
export function samePrefix(prefix: Uint8Array, bytes: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) return false;
  return Buffer.from(bytes.buffer, bytes.byteOffset, prefix.byteLength).equals(prefix);
}
