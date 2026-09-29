import { z, type ZodType } from 'zod';
import { CHOSEN_ENCODINGS, type Channel, type Requests } from './ipc';

/**
 * Argument schemas for every renderer → main channel. Imported by main only (SR-11), and kept out
 * of `index.ts` so the preload and renderer never reach zod.
 */
const documentId = z.string().min(1).max(64);

/** Where a tab is scrolled (ADR-002); also stored in sessions. */
export const scrollAnchor = z.strictObject({
  line: z.int().min(1).max(100_000_000),
  offset: z.number().min(-1e7).max(1e7),
  heading: z.string().min(1).max(256).nullable(),
  fraction: z.number().min(0).max(1),
});

/** A tab's zoom, 50 % to 300 %. */
export const zoomLevel = z.number().min(0.5).max(3);

export const requestSchemas: { [C in Channel]: ZodType<Requests[C]> } = {
  'app.info': z.tuple([]),
  'app.resolveSandboxUnavailable': z.tuple([z.enum(['quit', 'run-unsandboxed'])]),
  'documents.read': z.tuple([documentId]),
  'documents.setEncoding': z.tuple([documentId, z.enum(CHOSEN_ENCODINGS).nullable()]),
  'documents.followLink': z.tuple([documentId, z.string().min(1).max(8192), z.enum(['current', 'background'])]),
  'documents.back': z.tuple([documentId]),
  'documents.forward': z.tuple([documentId]),
  'documents.resolveImage': z.tuple([documentId, z.string().min(1).max(8192)]),
  'documents.pathMenu': z.tuple([documentId]),
  'documents.contextMenu': z.tuple([documentId]),
  'tabs.snapshot': z.tuple([]),
  'tabs.activated': z.tuple([documentId]),
  'tabs.rendered': z.tuple([documentId, z.int().min(0).max(2 ** 31)]),
  'tabs.position': z.tuple([documentId, scrollAnchor]),
  'tabs.zoom': z.tuple([documentId, zoomLevel]),
  'tabs.close': z.tuple([documentId]),
  'tabs.reopenClosed': z.tuple([]),
  'tabs.move': z.tuple([documentId, z.int().min(0).max(9999)]),
  'settings.get': z.tuple([]),
  'session.previous': z.tuple([]),
  'session.restorePrevious': z.tuple([z.int().min(1).max(3)]),
  'recent.list': z.tuple([]),
  'recent.open': z.tuple([documentId]),
  'recent.clear': z.tuple([]),
  'profiles.created': z.tuple([]),
  'profiles.undoCreate': z.tuple([documentId]),
};
