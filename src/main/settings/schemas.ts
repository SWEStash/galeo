import { z, type ZodType } from 'zod';
import type { Parse } from '../../core/settings/config-file';
import type { ProfileFile } from '../../core/settings/profile-settings';
import type { SettingsOverrides } from '../../shared/settings';

/**
 * Schemas for the hand-editable config files (SR-17). Strict: an unknown key is most likely a typo,
 * and saying so beats ignoring it.
 */
const overrides = z.strictObject({
  themeMode: z.enum(['system', 'light', 'dark']),
  proseFont: z.string().min(1).max(100),
  codeFont: z.string().min(1).max(100),
  fontSize: z.int().min(10).max(40),
  measure: z.int().min(40).max(200),
  statusBar: z.boolean(),
  quickOpenExclude: z.array(z.string().min(1).max(255)).max(1000),
  warmTabs: z.int().min(0).max(20),
  warmMegabytes: z.int().min(1).max(1024),
}).partial();

const profile = z.strictObject({
  name: z.string().min(1).max(64).optional(),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  settings: overrides.optional(),
});

function parser<T>(schema: ZodType<T>): Parse<T> {
  return (data) => {
    const { schemaVersion: _version, ...rest } = data as Record<string, unknown>;
    const result = schema.safeParse(rest);
    return result.success ? { ok: true, value: result.data } : { ok: false, detail: z.prettifyError(result.error) };
  };
}

export const parseGlobalSettings: Parse<SettingsOverrides> = parser(overrides as ZodType<SettingsOverrides>);
export const parseProfileFile: Parse<ProfileFile> = parser(profile as ZodType<ProfileFile>);
