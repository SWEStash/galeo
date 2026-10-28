/**
 * A record's own keys, typed as its keys. `Object.keys` says `string[]`, as an object may carry
 * more keys than its type names; the records this is for are literals the code owns.
 */
export function keysOf<K extends string>(record: Readonly<Record<K, unknown>>): K[] {
  return Object.keys(record) as K[];
}
