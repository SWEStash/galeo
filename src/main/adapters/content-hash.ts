import { createHash } from 'node:crypto';
import type { Hash } from '../../core/documents/read';

/** SHA-256 of a file's bytes, hex: the version a save names (ADR-013). */
export const sha256: Hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
