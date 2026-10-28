import { describe, expect, it } from 'vitest';
import { keysOf } from './records';

describe('keysOf', () => {
  it("lists a record's own keys, in order, typed as its keys", () => {
    const names: Record<'a' | 'b', number> = { a: 1, b: 2 };
    const keys: ('a' | 'b')[] = keysOf(names);
    expect(keys).toEqual(['a', 'b']);
  });
});
