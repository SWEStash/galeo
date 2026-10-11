import { z, type ZodType } from 'zod';
import type { RecentFile } from '../../core/session/recent';
import type { SessionFile } from '../../core/session/model';
import { HISTORY_DEPTH } from '../../core/tabs/registry';
import { isProfileId } from '../../core/profiles/names';
import type { Parse } from '../../core/settings/json-file';
import { CHOSEN_ENCODINGS } from '../../shared/contracts';
import { scrollAnchor, tabViewState, zoomLevel } from '../../shared/contracts/schemas';
import { parserFor } from '../schemas/parse';

/**
 * Schemas for the app-written state files (SR-16, SR-17): paths, positions and view state only,
 * bounded so a hostile or corrupt file can't make restoring expensive.
 */
// Absolute: POSIX, a drive letter, or a UNC share. Windows long paths reach 32,767 characters.
const path = z
  .string()
  .min(1)
  .max(32_767)
  .refine((value) => value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\'), 'absolute path');

const entry = z.strictObject({
  path,
  // As long as a link may be (`documents.followLink` takes 8,192).
  anchor: z.string().max(8192).nullable(),
  position: scrollAnchor.optional(),
  encoding: z.enum(CHOSEN_ENCODINGS).optional(),
  ...tabViewState.shape,
  chosen: z.literal(true).optional(),
});

const tab = z
  .strictObject({
    entries: z.array(entry).min(1).max(HISTORY_DEPTH),
    index: z.int().min(0),
    zoom: zoomLevel.optional(),
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

export const parseSession: Parse<SessionFile> = parserFor(session as ZodType<SessionFile>);
export const parseRecentFiles: Parse<{ files: RecentFile[] }> = parserFor(recent as ZodType<{ files: RecentFile[] }>);

const appState = z.strictObject({
  lastProfile: z.string().refine(isProfileId, 'profile id').nullable(),
});

export const parseAppState: Parse<{ lastProfile: string | null }> = parserFor(appState);
