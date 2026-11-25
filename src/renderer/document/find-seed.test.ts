import { describe, expect, it } from 'vitest';
import { findSeedOf } from './find-seed';

describe('findSeedOf (#70)', () => {
  it('takes text selected on one line as the query, as it is', () => {
    expect(findSeedOf('mermaid')).toBe('mermaid');
    expect(findSeedOf(' two words ')).toBe(' two words ');
  });

  it('takes nothing from an empty or blank selection', () => {
    expect(findSeedOf('')).toBeNull();
    expect(findSeedOf('   ')).toBeNull();
    expect(findSeedOf(null)).toBeNull();
  });

  it('takes nothing from a selection over several lines', () => {
    expect(findSeedOf('one\ntwo')).toBeNull();
    expect(findSeedOf('one\r\ntwo')).toBeNull();
    expect(findSeedOf('one\rtwo')).toBeNull();
  });
});
