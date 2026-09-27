import { z, type ZodType } from 'zod';
import type { Channel, Requests } from './ipc';

/**
 * Argument schemas for every renderer → main channel. Imported by main only (SR-11), and kept out
 * of `index.ts` so the preload and renderer never reach zod.
 */
export const requestSchemas: { [C in Channel]: ZodType<Requests[C]> } = {
  'app.info': z.tuple([]),
  'app.resolveSandboxUnavailable': z.tuple([z.enum(['quit', 'run-unsandboxed'])]),
  'documents.list': z.tuple([]),
  'documents.read': z.tuple([z.string().min(1).max(64)]),
};
