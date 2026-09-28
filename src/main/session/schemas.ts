import { z, type ZodType } from 'zod';
import type { RecentFile } from '../../core/session/recent';
import type { SessionFile } from '../../core/session/model';
import type { Parse } from '../../core/settings/json-file';
import { CHOSEN_ENCODINGS } from '../../shared/contracts';

/**
 * Schemas for the app-written state files (SR-16, SR-17): paths, positions and view state only,
 * bounded so a hostile or corrupt file can't make restoring expensive.
 */
const path = z.string().min(1).max(4096).refine((value) => value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value), 'absolute path');

const position = z.strictObject({
  line: z.int().min(1).max(100_000_000),
  offset: z.number().min(-1e7).max(1e7),
  heading: z.string().min(1).max(256).nullable(),
  fraction: z.number().min(0).max(1),
});

const entry = z.strictObject({
  path,
  anchor: z.string().max(1024).nullable(),
  position: position.optional(),
  encoding: z.enum(CHOSEN_ENCODINGS).optional(),
});

const tab = z
  .strictObject({
    entries: z.array(entry).min(1).max(50),
    index: z.int().min(0),
    zoom: z.number().min(0.5).max(3).optional(),
  })
  .refine((value) => value.index < value.entries.length, 'index outside the history');

const window = z
  .strictObject({
    bounds: z
      .strictObject({
        x: z.int().min(-100_000).max(100_000),
        y: z.int().min(-100_000).max(100_000),
        width: z.int().min(100).max(100_000),
        height: z.int().min(100).max(100_000),
        maximized: z.boolean(),
      })
      .nullable(),
    active: z.int().min(0).nullable(),
    tabs: z.array(tab).max(1000),
  })
  .refine((value) => value.active === null || value.active < value.tabs.length, 'active tab outside the tabs');

const session = z
  .strictObject({
    savedAt: z.number().min(0),
    windows: z.array(window).max(50),
    focusOrder: z.array(z.int().min(0)).max(50),
  })
  .refine((value) => value.focusOrder.every((index) => index < value.windows.length), 'focus order names a missing window');

const recent = z.strictObject({
  files: z.array(z.strictObject({ path, openedAt: z.number().min(0) })).max(200),
});

function parser<T>(schema: ZodType<T>): Parse<T> {
  return (data) => {
    const { schemaVersion: _version, ...rest } = data as Record<string, unknown>;
    const result = schema.safeParse(rest);
    return result.success ? { ok: true, value: result.data } : { ok: false, detail: z.prettifyError(result.error) };
  };
}

export const parseSession: Parse<SessionFile> = parser(session as ZodType<SessionFile>);
export const parseRecentFiles: Parse<{ files: RecentFile[] }> = parser(recent as ZodType<{ files: RecentFile[] }>);
