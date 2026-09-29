import { z, type ZodType } from 'zod';
import type { Parse } from '../../core/settings/json-file';
import { settingsOverrides as overrides } from '../../shared/contracts/schemas';
import { parserFor } from '../schemas/parse';
import type { ProfileFile } from '../../core/settings/profile-settings';
import type { SettingsOverrides } from '../../shared/settings';

/**
 * Schemas for the hand-editable config files (SR-17). Strict: an unknown key is most likely a typo,
 * and saying so beats ignoring it. The settings themselves are the Settings tab's schema too.
 */


const profile = z.strictObject({
  name: z.string().min(1).max(64).optional(),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  settings: overrides.optional(),
});

export const parseGlobalSettings: Parse<SettingsOverrides> = parserFor(overrides as ZodType<SettingsOverrides>);
export const parseProfileFile: Parse<ProfileFile> = parserFor(profile as ZodType<ProfileFile>);
