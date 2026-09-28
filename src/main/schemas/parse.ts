import { z, type ZodType } from 'zod';
import type { Parse } from '../../core/settings/json-file';

/** A file parser from a schema: drops `schemaVersion` (core handled it) and names what's wrong (SR-17). */
export function parserFor<T>(schema: ZodType<T>): Parse<T> {
  return (data) => {
    const { schemaVersion: _version, ...rest } = data as Record<string, unknown>;
    const result = schema.safeParse(rest);
    return result.success ? { ok: true, value: result.data } : { ok: false, detail: z.prettifyError(result.error) };
  };
}
